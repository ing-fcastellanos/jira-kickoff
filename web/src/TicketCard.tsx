import type { Ticket, TicketActivity } from './types'
import { relativeTime } from './api'

/**
 * "Rejected" es categoria `indeterminate` en Jira, igual que "In Progress",
 * pero significa lo contrario. Se colorea por nombre antes que por categoria.
 */
function statusClasses(ticket: Ticket): string {
  if (ticket.status.toLowerCase() === 'rejected') {
    return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
  }
  switch (ticket.statusCategory) {
    case 'new':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
    case 'indeterminate':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
    default:
      return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
  }
}

const HIGH_PRIORITIES = new Set(['highest', 'high'])

/**
 * Seguimiento del ticket. El worktree lo dice git; la fecha, el historial.
 * Que exista worktree manda: es lo que puedes retomar ahora mismo.
 */
function Progress({ activity }: { activity: TicketActivity }) {
  if (activity.worktree) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-xs">
        <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
        <span className="text-emerald-700 dark:text-emerald-400">Worktree activo</span>
        {activity.worktree.branch && (
          <span className="min-w-0 truncate font-mono text-zinc-400">
            {activity.worktree.branch}
          </span>
        )}
        {activity.worktree.dirty && (
          <span className="shrink-0 rounded bg-amber-100 px-1 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
            sin commitear
          </span>
        )}
      </span>
    )
  }

  if (activity.lastInitializedAt) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-zinc-400">
        <span className="size-1.5 shrink-0 rounded-full bg-zinc-400" />
        Inicializado {relativeTime(activity.lastInitializedAt)} · sin worktree
      </span>
    )
  }

  return null
}

export default function TicketCard({
  ticket,
  activity,
  onInitialize,
}: {
  ticket: Ticket
  activity: TicketActivity | undefined
  onInitialize: (ticket: Ticket) => void
}) {
  const urgent = ticket.priority ? HIGH_PRIORITIES.has(ticket.priority.toLowerCase()) : false
  const started = Boolean(activity?.worktree)

  return (
    <article className="group flex flex-col gap-2 border-b border-zinc-100 px-4 py-3 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <a
          href={ticket.url}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-sm font-semibold text-sky-700 hover:underline dark:text-sky-400"
        >
          {ticket.key}
        </a>
        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusClasses(ticket)}`}>
          {ticket.status}
        </span>
        <span className="text-xs text-zinc-500">{ticket.issueType}</span>
        {ticket.priority && (
          <span
            className={`text-xs ${urgent ? 'font-medium text-orange-600 dark:text-orange-400' : 'text-zinc-400'}`}
          >
            {ticket.priority}
          </span>
        )}
        <span className="ml-auto text-xs text-zinc-400">{relativeTime(ticket.updated)}</span>
      </div>

      <p className="text-sm text-zinc-800 dark:text-zinc-200">{ticket.summary}</p>

      <div className="flex items-center justify-between gap-3">
        {activity ? <Progress activity={activity} /> : <span />}
        <button
          type="button"
          onClick={() => onInitialize(ticket)}
          className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400 hover:bg-white dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
        >
          {started ? 'Retomar' : 'Inicializar'}
        </button>
      </div>
    </article>
  )
}
