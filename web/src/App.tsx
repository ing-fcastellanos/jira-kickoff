import { useCallback, useEffect, useState } from 'react'
import type {
  ActivityResponse,
  Health,
  SetupState,
  Ticket,
  TicketActivity,
  TicketsResponse,
} from './types'
import { getJson } from './api'
import TicketCard from './TicketCard'
import BranchDialog from './BranchDialog'
import WorktreesDialog from './WorktreesDialog'
import SettingsDialog from './SettingsDialog'
import TicketDetailDialog from './TicketDetailDialog'
import Onboarding from './Onboarding'
import { readTheme, watchSystemTheme } from './theme'
import { Button, Key } from './ui'
import { useT } from './LocaleProvider'

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
  // The order is set by Jira with `updated desc`; the project with the most recent goes on top.
  return [...groups.entries()]
}

function Dot() {
  return <span className="text-line-strong">·</span>
}

export default function App() {
  const { t, rel } = useT()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [health, setHealth] = useState<Health | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<Ticket | null>(null)
  const [showWorktrees, setShowWorktrees] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [activity, setActivity] = useState<Record<string, TicketActivity>>({})
  const [detail, setDetail] = useState<Ticket | null>(null)
  const [setup, setSetup] = useState<SetupState | null>(null)

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

  // Tracking is requested apart from the tickets: it queries local git and must
  // not delay the list, which is the first thing you want to see.
  const refreshActivity = useCallback(() => {
    getJson<ActivityResponse>('/api/activity')
      .then((r) => setActivity(r.byTicket))
      .catch(() => setActivity({}))
  }, [])

  // The configuration state rules: with no Jira site and no projects there is no
  // point querying anything, and asking would only produce confusing errors.
  const loadSetup = useCallback(() => {
    getJson<SetupState>('/api/setup')
      .then((s) => {
        setSetup(s)
        if (s.configured) {
          void fetchTickets(false)
          refreshHealth()
          refreshActivity()
        }
      })
      .catch(() => setSetup(null))
  }, [fetchTickets, refreshHealth, refreshActivity])

  useEffect(() => {
    loadSetup()
  }, [loadSetup])

  useEffect(() => watchSystemTheme(readTheme), [])

  const groups = load.status === 'ready' ? groupByProject(load.data.tickets) : []
  const total = load.status === 'ready' ? load.data.tickets.length : 0
  const started =
    load.status === 'ready' ? load.data.tickets.filter((x) => activity[x.key]?.worktree).length : 0

  // The global index staggers the appearance continuously across projects,
  // instead of restarting on every group.
  let row = 0

  if (setup && !setup.configured) {
    return <Onboarding state={setup} onReady={loadSetup} />
  }

  return (
    <div className="min-h-screen px-6 pt-8 pb-20">
      <div className="mx-auto flex max-w-[880px] flex-col gap-[22px]">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[25px] font-semibold tracking-tight text-ink">
              <span className="syntax">## </span>
              {t('app.title')}
            </h1>
            {load.status === 'ready' && (
              <p className="flex flex-wrap items-center gap-[7px] text-[13px] text-ink-5">
                <span>
                  {total} {total === 1 ? t('common.ticket') : t('common.tickets')}
                </span>
                {started > 0 && (
                  <>
                    <Dot />
                    <span className="text-ok">{t('app.withWorktree', { n: started })}</span>
                  </>
                )}
                <Dot />
                <span>{t('app.updated', { time: rel(load.data.fetchedAt) })}</span>
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button onClick={() => setShowSettings(true)}>{t('app.settings')}</Button>
            <Button onClick={() => setShowWorktrees(true)}>{t('app.worktrees')}</Button>
            <Button
              variant="primary"
              onClick={() => void fetchTickets(true)}
              disabled={refreshing}
              className="min-w-[104px] font-mono"
            >
              {refreshing ? t('app.refreshing') : t('app.refresh')}
            </Button>
          </div>
        </header>

        {health && !health.ok && (
          <section className="flex flex-col gap-2 rounded-lg border border-warn-line bg-warn-panel px-4 py-3.5">
            <h2 className="text-[13px] font-semibold text-warn">
              <span className="syntax opacity-70">&gt; </span>
              {t('app.healthTitle')}
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
              {t('app.openSettings')}
            </Button>
          </section>
        )}

        {load.status === 'loading' && <p className="text-[13px] text-ink-5">{t('app.loading')}</p>}

        {load.status === 'error' && (
          <section className="rounded-lg border border-danger-line bg-danger-panel px-4 py-3.5">
            <h2 className="text-[13px] font-semibold text-danger">
              <span className="syntax opacity-70">&gt; </span>
              {t('app.errorTitle')}
            </h2>
            <p className="mt-1.5 text-[12.5px] text-ink-3">{load.message}</p>
          </section>
        )}

        {load.status === 'ready' && total === 0 && (
          <div className="rounded-lg border border-line bg-card px-4 py-12 text-center">
            <p className="text-[13px] text-ink-5">{t('app.empty')}</p>
          </div>
        )}

        {groups.map(([projectKey, tickets]) => (
          <section key={projectKey} className="flex flex-col gap-2.5">
            <h2 className="flex flex-wrap items-baseline gap-[9px]">
              <Key>{projectKey}</Key>
              <span className="text-[13px] font-medium text-ink-3">{tickets[0]?.projectName}</span>
              <span className="text-[11.5px] text-ink-6">
                {tickets.length} {tickets.length === 1 ? t('common.ticket') : t('common.tickets')}
              </span>
            </h2>
            <div className="flex flex-col gap-2">
              {tickets.map((x) => (
                <TicketCard
                  key={x.key}
                  ticket={x}
                  activity={activity[x.key]}
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
            // Deleting a worktree changes the tracking of its ticket.
            refreshActivity()
          }}
        />
      )}
      {showSettings && (
        <SettingsDialog
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            // Changing projects, statuses or the filter changes what Jira returns.
            void fetchTickets(true)
            refreshHealth()
          }}
        />
      )}
    </div>
  )
}
