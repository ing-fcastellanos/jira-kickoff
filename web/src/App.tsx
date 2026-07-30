import { useCallback, useEffect, useState } from 'react'
import type { ActivityResponse, Health, Ticket, TicketActivity, TicketsResponse } from './types'
import { getJson, relativeTime } from './api'
import TicketCard from './TicketCard'
import BranchDialog from './BranchDialog'
import WorktreesDialog from './WorktreesDialog'
import SettingsDialog from './SettingsDialog'
import TicketDetailDialog from './TicketDetailDialog'
import { readTheme, watchSystemTheme } from './theme'

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: TicketsResponse }

function groupByProject(tickets: Ticket[]): [string, Ticket[]][] {
  const groups = new Map<string, Ticket[]>()
  for (const t of tickets) {
    const list = groups.get(t.projectKey)
    if (list) list.push(t)
    else groups.set(t.projectKey, [t])
  }
  // El orden lo fija Jira por `updated desc`; el proyecto con lo mas reciente va arriba.
  return [...groups.entries()]
}

export default function App() {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [health, setHealth] = useState<Health | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<Ticket | null>(null)
  const [showWorktrees, setShowWorktrees] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [activity, setActivity] = useState<Record<string, TicketActivity>>({})
  const [detail, setDetail] = useState<Ticket | null>(null)

  const fetchTickets = useCallback(async (fresh: boolean) => {
    if (fresh) setRefreshing(true)
    try {
      const data = await getJson<TicketsResponse>(`/api/tickets${fresh ? '?refresh=1' : ''}`)
      setLoad({ status: 'ready', data })
    } catch (err) {
      setLoad({ status: 'error', message: (err as Error).message })
    } finally {
      setRefreshing(false)
    }
  }, [])

  const refreshHealth = useCallback(() => {
    getJson<Health>('/api/health')
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  // El seguimiento se pide aparte de los tickets: consulta git local y no debe
  // retrasar la lista, que es lo primero que quieres ver.
  const refreshActivity = useCallback(() => {
    getJson<ActivityResponse>('/api/activity')
      .then((r) => setActivity(r.byTicket))
      .catch(() => setActivity({}))
  }, [])

  useEffect(() => {
    void fetchTickets(false)
    refreshHealth()
    refreshActivity()
  }, [fetchTickets, refreshHealth, refreshActivity])

  useEffect(() => watchSystemTheme(readTheme), [])

  const groups = load.status === 'ready' ? groupByProject(load.data.tickets) : []
  const total = load.status === 'ready' ? load.data.tickets.length : null
  const started =
    load.status === 'ready'
      ? load.data.tickets.filter((t) => activity[t.key]?.worktree).length
      : 0

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mi trabajo pendiente</h1>
          {load.status === 'ready' && (
            <p className="mt-1 text-sm text-zinc-500">
              {total} {total === 1 ? 'ticket' : 'tickets'}
              {started > 0 && (
                <>
                  {' · '}
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {started} con worktree
                  </span>
                </>
              )}{' '}
              · actualizado {relativeTime(load.data.fetchedAt)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            Opciones
          </button>
          <button
            type="button"
            onClick={() => setShowWorktrees(true)}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            Worktrees
          </button>
          <button
            type="button"
            onClick={() => void fetchTickets(true)}
            disabled={refreshing}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            {refreshing ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </header>

      {health && !health.ok && (
        <section className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-300">
            Configuración incompleta
          </h2>
          <ul className="mt-2 space-y-1">
            {health.problems.map((p) => (
              <li key={p} className="text-sm text-amber-800 dark:text-amber-400">
                · {p}
              </li>
            ))}
          </ul>
        </section>
      )}

      {load.status === 'loading' && <p className="text-sm text-zinc-500">Consultando Jira…</p>}

      {load.status === 'error' && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">
            No pude traer los tickets
          </p>
          <p className="mt-1 text-sm text-red-700 dark:text-red-400">{load.message}</p>
        </div>
      )}

      {load.status === 'ready' && total === 0 && (
        <div className="rounded-lg border border-zinc-200 p-8 text-center dark:border-zinc-800">
          <p className="text-sm text-zinc-500">
            No tienes tickets asignados en los status configurados.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {groups.map(([projectKey, tickets]) => (
          <section key={projectKey}>
            <h2 className="mb-2 flex items-baseline gap-2">
              <span className="font-mono text-sm font-semibold">{projectKey}</span>
              <span className="text-sm text-zinc-500">{tickets[0]?.projectName}</span>
              <span className="text-xs text-zinc-400">
                {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}
              </span>
            </h2>
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
              {tickets.map((t) => (
                <TicketCard
                  key={t.key}
                  ticket={t}
                  activity={activity[t.key]}
                  onInitialize={setSelected}
                  onDetail={setDetail}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {detail && <TicketDetailDialog ticket={detail} onClose={() => setDetail(null)} />}
      {selected && (
        <BranchDialog
          ticket={selected}
          onClose={() => setSelected(null)}
          onInitialized={refreshActivity}
        />
      )}
      {showWorktrees && (
        <WorktreesDialog
          onClose={() => {
            setShowWorktrees(false)
            // Borrar un worktree cambia el seguimiento de su ticket.
            refreshActivity()
          }}
        />
      )}
      {showSettings && (
        <SettingsDialog
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            // Cambiar proyectos, statuses o el filtro cambia lo que Jira devuelve.
            void fetchTickets(true)
            refreshHealth()
          }}
        />
      )}
    </main>
  )
}
