import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { z } from 'zod'
import { resolvePrompt, type ConfigStore } from '../config'
import type { TicketService } from '../ticket-service'
import type { InitializeResult, PromptResponse, Ticket } from '../types'
import { PROMPT_MAX_LENGTH, PROMPT_WARN_LENGTH, URL_SAFE_LENGTH, composePrompt } from '../prompt'
import { buildDeepLink, openUrl } from '../launcher'
import {
  WorktreeConflictError,
  createWorktree,
  fetchOrigin,
  isValidBranchName,
  worktreePathFor,
} from '../worktree'
import { replyWithError } from './errors'

const initializeBody = z.object({
  ticketKey: z.string().min(1),
  branch: z.string().min(1),
  prompt: z.string().min(1).max(PROMPT_MAX_LENGTH),
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
}> = async (app, opts) => {
  const { store, tickets } = opts

  /** Resuelve ticket, repo y ruta de worktree, o responde el error correspondiente. */
  async function resolve(ticketKey: string, reply: FastifyReply): Promise<Resolved | null> {
    const config = store.get()
    const ticket = await tickets.find(ticketKey.toUpperCase())
    if (!ticket) {
      await reply.status(404).send({ error: `${ticketKey} no esta entre tus tickets abiertos.` })
      return null
    }

    const project = config.projects[ticket.projectKey]
    if (!project) {
      await reply
        .status(400)
        .send({ error: `El proyecto ${ticket.projectKey} no esta en config.json.` })
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
    const { ticketKey, branch, prompt } = parsed.data

    try {
      const r = await resolve(ticketKey, reply)
      if (!r) return reply

      if (!(await isValidBranchName(r.repo, branch))) {
        return reply.status(400).send({ error: `"${branch}" no es un nombre de rama valido.` })
      }

      // `ls-remote` consulta el remoto sin actualizar refs locales, y el worktree
      // se crea desde `origin/<base>`. Sin este fetch se partiria de una base vieja.
      await fetchOrigin(r.repo)

      const { action, created } = await createWorktree({
        repo: r.repo,
        worktreePath: r.worktree,
        branch,
        baseBranch: r.baseBranch,
      })

      // El worktree ya existe pase lo que pase con el deep link: si falla, el
      // usuario pega el prompt a mano y no pierde ninguno de los pasos previos.
      const deepLink = buildDeepLink(prompt, r.worktree)
      if (deepLink.length > URL_SAFE_LENGTH) {
        return reply.status(400).send({
          error:
            `El prompt genera una URL de ${deepLink.length} caracteres, por encima del limite ` +
            `de la linea de comandos de Windows. Acortalo y vuelve a intentarlo. ` +
            `El worktree ya quedo creado en ${r.worktree}.`,
        })
      }

      // En modo `clipboard` no se intenta abrir nada: el worktree queda hecho y
      // la UI ofrece el prompt para pegarlo. Es la salida cuando el deep link
      // deja de funcionar tras una actualizacion de la app.
      const launchMode = store.get().launch.mode
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
      }
      return result
    } catch (err) {
      if (err instanceof WorktreeConflictError) {
        return reply.status(409).send({ error: err.message })
      }
      return replyWithError(reply, err)
    }
  })
}
