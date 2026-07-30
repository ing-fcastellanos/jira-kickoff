import { resolve, sep } from 'node:path'
import type { FastifyPluginAsync } from 'fastify'
import type { ConfigStore } from '../config'
import type { HistoryStore } from '../history'
import type { ActivityResponse, TicketActivity } from '../types'
import { isDirty, listWorktrees } from '../worktree'

/**
 * Estado de cada ticket ya inicializado.
 *
 * El worktree se deriva de git, que no puede desincronizarse: si lo borras a
 * mano, el ticket vuelve a aparecer como no empezado, que es la verdad. El
 * historial cubre lo que git ya olvido — que se inicializo y se limpio despues.
 *
 * Solo consulta git local. Nada de red: esto se pide junto con la lista de
 * tickets y no puede costar lo que cuesta un `ls-remote`.
 */
/**
 * Forma de una clave de Jira: `ABC-123`, sin nada detras.
 *
 * En la carpeta de worktrees conviven los que crea este panel, nombrados como el
 * ticket, y los que crea la propia app de Claude Code con nombres generados
 * (`silly-turing-0ec969`) o derivados (`abc-123-explore-2fa6d7`). Solo los
 * primeros representan «este ticket esta empezado».
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

    // El worktree se nombra como el ticket, asi que el nombre de la carpeta es
    // la clave. Las carpetas que no correspondan a un ticket simplemente no
    // encajaran con ninguno de la lista.
    await Promise.all(
      Object.entries(config.projects).map(async ([projectKey, project]) => {
        const root = resolve(project.repo, config.worktrees.dir)

        let entries
        try {
          entries = await listWorktrees(project.repo)
        } catch {
          return // Un repo inaccesible no debe tumbar el resto de la lista.
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
