import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { z } from 'zod'
import { resolvePrompt, type ConfigStore } from '../config'
import type { TicketService } from '../ticket-service'
import type { HistoryStore } from '../history'
import type { InitializeResult, PromptResponse, Ticket } from '../types'
import { PROMPT_MAX_LENGTH, PROMPT_WARN_LENGTH, URL_SAFE_LENGTH, composePrompt } from '../prompt'
import { buildDeepLink, openUrl } from '../launcher'
import {
  WorktreeConflictError,
  createWorktree,
  fetchOrigin,
  isValidBranchName,
  setOriginHead,
  setWorktreeModel,
  setWorktreePermissionMode,
  worktreePathFor,
} from '../worktree'
import { replyWithError, say } from './errors'

const initializeBody = z.object({
  ticketKey: z.string().min(1),
  branch: z.string().min(1),
  prompt: z.string().min(1).max(PROMPT_MAX_LENGTH),
  /**
   * Already resolved by the client, same as `prompt`: empty means inherit, a
   * value means override. The dialog preselects the configured default, so
   * this is whatever the user ended up with, not a delta to merge with config.
   */
  model: z.string().trim().default(''),
})

interface Resolved {
  ticket: Ticket
  repo: string
  baseBranch: string
  worktree: string
}

export const initializeRoutes: FastifyPluginAsync<{
  store: ConfigStore
  tickets: TicketService
  history: HistoryStore
}> = async (app, opts) => {
  const { store, tickets, history } = opts

  /** Resolves ticket, repo and worktree path, or answers with the matching error. */
  async function resolve(ticketKey: string, reply: FastifyReply): Promise<Resolved | null> {
    const config = store.get()
    const ticket = await tickets.find(ticketKey.toUpperCase())
    if (!ticket) {
      await reply.status(404).send({ error: say(reply, 'err.ticketNotFound', { ticket: ticketKey }) })
      return null
    }

    const project = config.projects[ticket.projectKey]
    if (!project) {
      await reply
        .status(400)
        .send({ error: say(reply, 'err.projectNotConfigured', { project: ticket.projectKey }) })
      return null
    }

    return {
      ticket,
      repo: project.repo,
      baseBranch: project.baseBranch,
      worktree: worktreePathFor(project.repo, config.worktrees.dir, ticket.key),
    }
  }

  app.get<{ Params: { ticketKey: string }; Querystring: { branch?: string } }>(
    '/api/prompt/:ticketKey',
    async (req, reply) => {
      try {
        const r = await resolve(req.params.ticketKey, reply)
        if (!r) return reply

        const prompt = composePrompt(resolvePrompt(store.get(), r.ticket.projectKey), {
          ticket: r.ticket,
          branch: req.query.branch ?? '',
          baseBranch: r.baseBranch,
          repo: r.repo,
          worktree: r.worktree,
        })

        const payload: PromptResponse = {
          prompt,
          worktree: r.worktree,
          maxLength: PROMPT_MAX_LENGTH,
          warnLength: PROMPT_WARN_LENGTH,
        }
        return payload
      } catch (err) {
        return replyWithError(reply, err)
      }
    },
  )

  app.post('/api/initialize', async (req, reply) => {
    const parsed = initializeBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      })
    }
    const { ticketKey, branch, prompt, model } = parsed.data

    try {
      const r = await resolve(ticketKey, reply)
      if (!r) return reply

      if (!(await isValidBranchName(r.repo, branch))) {
        return reply.status(400).send({ error: say(reply, 'err.invalidBranch', { branch }) })
      }

      // `ls-remote` queries the remote without updating local refs, and the
      // worktree is created from `origin/<base>`. Without this fetch it would
      // start from a stale base.
      await fetchOrigin(r.repo)

      const config = store.get()

      // Claude Code works out the main branch from `origin/HEAD`, not from the
      // base we use here. If the remote declares another one, the session shows
      // it wrong.
      if (config.worktrees.alignOriginHead) {
        await setOriginHead(r.repo, r.baseBranch)
      }

      const { action, created } = await createWorktree({
        repo: r.repo,
        worktreePath: r.worktree,
        branch,
        baseBranch: r.baseBranch,
      })

      // The deep link cannot ask for a permission mode, so it is written into
      // the worktree before opening the session.
      if (config.launch.permissionMode !== 'inherit') {
        await setWorktreePermissionMode(r.worktree, config.launch.permissionMode)
      }

      // Same story as permission mode: the deep link has no room for a model,
      // so it goes into the worktree first. `model` already carries whatever the
      // dialog resolved, default or overridden.
      if (model) {
        await setWorktreeModel(r.worktree, model)
      }

      // The worktree already exists whatever happens with the deep link: if it
      // fails, the user pastes the prompt by hand and loses no earlier step.
      const deepLink = buildDeepLink(prompt, r.worktree)
      if (deepLink.length > URL_SAFE_LENGTH) {
        return reply.status(400).send({
          error: say(reply, 'err.urlTooLong', {
            length: deepLink.length,
            worktree: r.worktree,
          }),
        })
      }

      // In `clipboard` mode nothing is opened: the worktree is done and the UI
      // offers the prompt to paste. This is the way out when the deep link stops
      // working after an app update.
      const launchMode = config.launch.mode
      let launched = false
      let launchError: string | null = null

      if (launchMode === 'open') {
        try {
          await openUrl(deepLink)
          launched = true
        } catch (err) {
          launchError = (err as Error).message
        }
      }

      // Recorded even if the deep link fails: the worktree exists and the ticket
      // is started, which is exactly what the tracking must reflect.
      history.record({
        ticketKey: r.ticket.key,
        projectKey: r.ticket.projectKey,
        branch,
        worktree: r.worktree,
        at: new Date().toISOString(),
        launchMode,
      })

      const result: InitializeResult = {
        ticketKey: r.ticket.key,
        branch,
        branchAction: action,
        worktree: r.worktree,
        worktreeCreated: created,
        deepLink,
        launchMode,
        launched,
        launchError,
        model: model || null,
      }
      return result
    } catch (err) {
      // WorktreeConflictError already carries its own 409 and message key.
      return replyWithError(reply, err)
    }
  })
}
