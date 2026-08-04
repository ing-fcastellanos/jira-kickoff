import { resolve, sep } from 'node:path'
import type { FastifyPluginAsync } from 'fastify'
import type { ConfigStore } from '../config'
import type { HistoryStore } from '../history'
import type { ActivityResponse, TicketActivity } from '../types'
import { isDirty, listWorktrees } from '../worktree'

/**
 * State of every already-initialized ticket.
 *
 * The worktree is derived from git, which cannot fall out of sync: if you delete
 * it by hand, the ticket goes back to showing as not started, which is the
 * truth. The history covers what git has already forgotten — that it was
 * initialized and cleaned up afterwards.
 *
 * It only queries local git. No network: this is requested alongside the ticket
 * list and cannot cost what an `ls-remote` costs.
 */
/**
 * Shape of a Jira key: `ABC-123`, with nothing after it.
 *
 * The worktrees folder is shared between the ones this panel creates, named
 * after the ticket, and the ones the Claude Code app creates itself with
 * generated (`silly-turing-0ec969`) or derived (`abc-123-explore-2fa6d7`) names.
 * Only the former mean "this ticket is started".
 */
const TICKET_KEY = /^[A-Z][A-Z0-9]*-\d+$/

export const activityRoutes: FastifyPluginAsync<{
  store: ConfigStore
  history: HistoryStore
}> = async (app, opts) => {
  const { store, history } = opts

  app.get('/api/activity', async () => {
    const config = store.get()
    const byTicket: Record<string, TicketActivity> = {}

    // The worktree is named after the ticket, so the folder name is the key.
    // Folders that do not correspond to a ticket simply will not match any of
    // the ones in the list.
    await Promise.all(
      Object.entries(config.projects).map(async ([projectKey, project]) => {
        const root = resolve(project.repo, config.worktrees.dir)

        let entries
        try {
          entries = await listWorktrees(project.repo)
        } catch {
          return // An unreachable repo must not bring down the rest of the list.
        }

        const managed = entries.filter((w) =>
          resolve(w.path).toLowerCase().startsWith(root.toLowerCase() + sep),
        )

        await Promise.all(
          managed.map(async (w) => {
            const path = resolve(w.path)
            const name = path.split(sep).pop() ?? ''
            const key = name.toUpperCase()
            if (!TICKET_KEY.test(key)) return

            byTicket[key] = {
              projectKey,
              worktree: {
                path,
                branch: w.branch,
                dirty: await isDirty(path).catch(() => false),
              },
              lastInitializedAt: null,
              lastBranch: null,
              times: 0,
            }
          }),
        )
      }),
    )

    for (const [ticketKey, h] of Object.entries(history.byTicket())) {
      const current = byTicket[ticketKey]
      if (current) {
        current.lastInitializedAt = h.lastInitializedAt
        current.lastBranch = h.lastBranch
        current.times = h.times
      } else {
        byTicket[ticketKey] = {
          projectKey: null,
          worktree: null,
          lastInitializedAt: h.lastInitializedAt,
          lastBranch: h.lastBranch,
          times: h.times,
        }
      }
    }

    const payload: ActivityResponse = { byTicket, fetchedAt: new Date().toISOString() }
    return payload
  })
}
