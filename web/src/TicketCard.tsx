import type { Ticket, TicketActivity } from './types'
import { Button, Key } from './ui'
import { useT } from './LocaleProvider'

/**
 * "Rejected" is category `indeterminate` in Jira, just like "In Progress", but
 * it means the opposite. It is told apart by name before by category.
 *
 * The status name is not translated: it comes from Jira and is the one the user
 * sees on their board. Translating it here would invent a vocabulary that does
 * not exist there.
 */
function statusBadge(ticket: Ticket): string {
  if (ticket.status.toLowerCase() === 'rejected') return 'bg-danger-bg text-danger'
  switch (ticket.statusCategory) {
    case 'new':
      return 'bg-info-bg text-info'
    case 'indeterminate':
      return 'bg-warn-bg text-warn'
    default:
      return 'bg-ok-bg text-ok'
  }
}

const HIGH_PRIORITIES = new Set(['highest', 'high'])

/**
 * Ticket tracking. The worktree is told by git; the date, by the history.
 * An existing worktree wins: it is what you can resume right now.
 */
function Progress({ activity }: { activity: TicketActivity }) {
  const { t, rel } = useT()

  if (activity.worktree) {
    return (
      <span className="flex min-w-0 items-center gap-[7px] text-xs text-ok">
        <span className="size-1.5 shrink-0 rounded-full bg-ok" />
        <span className="shrink-0">{t('card.worktreeActive')}</span>
        {activity.worktree.branch && (
          <span className="truncate font-mono text-ink-6">
            <span className="opacity-50">`</span>
            {activity.worktree.branch}
            <span className="opacity-50">`</span>
          </span>
        )}
        {activity.worktree.dirty && (
          <span className="badge shrink-0 bg-warn-bg font-mono text-warn">
            {t('card.uncommitted')}
          </span>
        )}
      </span>
    )
  }

  if (activity.lastInitializedAt) {
    return (
      <span className="flex items-center gap-[7px] text-xs text-ink-6">
        <span className="size-1.5 shrink-0 rounded-full bg-line-strong" />
        {t('card.initializedNoWorktree', { time: rel(activity.lastInitializedAt) })}
      </span>
    )
  }

  return null
}

export default function TicketCard({
  ticket,
  activity,
  index,
  onInitialize,
  onDetail,
}: {
  ticket: Ticket
  activity: TicketActivity | undefined
  index: number
  onInitialize: (ticket: Ticket) => void
  onDetail: (ticket: Ticket) => void
}) {
  const { t, rel } = useT()
  const urgent = ticket.priority ? HIGH_PRIORITIES.has(ticket.priority.toLowerCase()) : false
  const started = Boolean(activity?.worktree)

  return (
    <article
      className="rise flex flex-col gap-2 rounded-lg border border-line bg-card px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.45)] hover:border-line-strong"
      // The stagger is cut early: past the first screen it adds nothing, and
      // delaying rows the user is looking at is worse than not animating them.
      style={{ animationDelay: `${Math.min(index, 12) * 22}ms` }}
    >
      <div className="flex flex-wrap items-center gap-x-[9px] gap-y-1.5">
        <a href={ticket.url} target="_blank" rel="noreferrer" className="hover:underline">
          <Key>{ticket.key}</Key>
        </a>
        <span className={`badge ${statusBadge(ticket)}`}>{ticket.status}</span>
        <span className="text-[11.5px] text-ink-4">{ticket.issueType}</span>
        {ticket.priority && (
          <span className={`text-[11.5px] ${urgent ? 'font-medium text-hot' : 'text-ink-6'}`}>
            {ticket.priority}
          </span>
        )}
        <span className="ml-auto shrink-0 text-[11.5px] text-ink-6">{rel(ticket.updated)}</span>
      </div>

      <p className="text-[14.5px] leading-snug font-semibold text-pretty text-ink">
        <span className="syntax">### </span>
        {ticket.summary}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-x-3.5 gap-y-2">
        {activity ? <Progress activity={activity} /> : <span />}
        <div className="flex shrink-0 gap-[7px]">
          <Button variant="quiet" onClick={() => onDetail(ticket)}>
            {t('card.detail')}
          </Button>
          <Button variant={started ? 'primary' : 'outline'} onClick={() => onInitialize(ticket)}>
            {started ? t('card.resume') : t('card.initialize')}
          </Button>
        </div>
      </div>
    </article>
  )
}
