import type { Ticket } from './types'
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

export default function TicketCard({
  ticket,
  onInitialize,
}: {
  ticket: Ticket
  onInitialize: (ticket: Ticket) => void
}) {
  const urgent = ticket.priority ? HIGH_PRIORITIES.has(ticket.priority.toLowerCase()) : false

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

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onInitialize(ticket)}
          className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400 hover:bg-white dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
        >
          Inicializar
        </button>
      </div>
    </article>
  )
}
