import { useCallback, useEffect, useState } from 'react'
import type { ActivityResponse, Health, Ticket, TicketActivity, TicketsResponse } from './types'
import { getJson, relativeTime } from './api'
import TicketCard from './TicketCard'
import BranchDialog from './BranchDialog'
import WorktreesDialog from './WorktreesDialog'
import SettingsDialog from './SettingsDialog'
import TicketDetailDialog from './TicketDetailDialog'
import { readTheme, watchSystemTheme } from './theme'
import { Button, Key } from './ui'

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

function Dot() {
  return <span className="text-line-strong">·</span>
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
    load.status === 'ready' ? load.data.tickets.filter((t) => activity[t.key]?.worktree).length : 0

  // El indice global escalona la aparicion de forma continua entre proyectos,
  // en vez de reiniciarse en cada grupo.
  let row = 0

  return (
    <div className="min-h-screen px-6 pt-8 pb-20">
      <div className="mx-auto flex max-w-[880px] flex-col gap-[22px]">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[25px] font-semibold tracking-tight text-ink">
              <span className="syntax">## </span>Mi trabajo pendiente
            </h1>
            {load.status === 'ready' && (
              <p className="flex flex-wrap items-center gap-[7px] text-[13px] text-ink-5">
                <span>
                  {total} {total === 1 ? 'ticket' : 'tickets'}
                </span>
                {started > 0 && (
                  <>
                    <Dot />
                    <span className="text-ok">{started} con worktree</span>
                  </>
                )}
                <Dot />
                <span>actualizado {relativeTime(load.data.fetchedAt)}</span>
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button onClick={() => setShowSettings(true)}>Opciones</Button>
            <Button onClick={() => setShowWorktrees(true)}>Worktrees</Button>
            <Button
              variant="primary"
              onClick={() => void fetchTickets(true)}
              disabled={refreshing}
              className="min-w-[104px] font-mono"
            >
              {refreshing ? 'Actualizando…' : 'Actualizar'}
            </Button>
          </div>
        </header>

        {health && !health.ok && (
          <section className="flex flex-col gap-2 rounded-lg border border-warn-line bg-warn-panel px-4 py-3.5">
            <h2 className="text-[13px] font-semibold text-warn">
              <span className="syntax opacity-70">&gt; </span>Configuración incompleta
            </h2>
            <ul className="flex flex-col gap-1.5">
              {health.problems.map((p) => (
                <li key={p} className="flex gap-2 text-[12.5px] text-ink-3">
                  <span className="syntax shrink-0 opacity-70">-</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <Button variant="warn" onClick={() => setShowSettings(true)} className="mt-0.5 self-start">
              Abrir opciones
            </Button>
          </section>
        )}

        {load.status === 'loading' && <p className="text-[13px] text-ink-5">Consultando Jira…</p>}

        {load.status === 'error' && (
          <section className="rounded-lg border border-danger-line bg-danger-panel px-4 py-3.5">
            <h2 className="text-[13px] font-semibold text-danger">
              <span className="syntax opacity-70">&gt; </span>No pude traer los tickets
            </h2>
            <p className="mt-1.5 text-[12.5px] text-ink-3">{load.message}</p>
          </section>
        )}

        {load.status === 'ready' && total === 0 && (
          <div className="rounded-lg border border-line bg-card px-4 py-12 text-center">
            <p className="text-[13px] text-ink-5">
              No tienes tickets asignados en los status configurados.
            </p>
          </div>
        )}

        {groups.map(([projectKey, tickets]) => (
          <section key={projectKey} className="flex flex-col gap-2.5">
            <h2 className="flex flex-wrap items-baseline gap-[9px]">
              <Key>{projectKey}</Key>
              <span className="text-[13px] font-medium text-ink-3">{tickets[0]?.projectName}</span>
              <span className="text-[11.5px] text-ink-6">
                {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}
              </span>
            </h2>
            <div className="flex flex-col gap-2">
              {tickets.map((t) => (
                <TicketCard
                  key={t.key}
                  ticket={t}
                  activity={activity[t.key]}
                  index={row++}
                  onInitialize={setSelected}
                  onDetail={setDetail}
                />
              ))}
            </div>
          </section>
        ))}

        {load.status === 'ready' && (
          <footer className="mt-1.5 flex flex-wrap items-center justify-between gap-4 border-t border-line-soft pt-4">
            <span className="font-mono text-[11.5px] break-all text-ink-6">{load.data.jql}</span>
          </footer>
        )}
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
    </div>
  )
}
