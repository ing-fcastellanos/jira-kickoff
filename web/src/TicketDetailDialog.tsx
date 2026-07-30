import { useEffect, useState } from 'react'
import type { Ticket, TicketDetail } from './types'
import { getJson, relativeTime } from './api'
import Markdown from './Markdown'

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: TicketDetail }

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1">
      <dt className="w-24 shrink-0 text-xs text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-xs text-zinc-700 dark:text-zinc-300">{children}</dd>
    </div>
  )
}

function Person({ person }: { person: { name: string; avatar: string | null } | null }) {
  if (!person) return <span className="text-zinc-400">sin asignar</span>
  return (
    <span className="flex items-center gap-1.5">
      {person.avatar && <img src={person.avatar} alt="" className="size-4 rounded-full" />}
      {person.name}
    </span>
  )
}

export default function TicketDetailDialog({
  ticket,
  onClose,
}: {
  ticket: Ticket
  onClose: () => void
}) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    getJson<TicketDetail>(`/api/tickets/${ticket.key}`)
      .then((data) => {
        if (!cancelled) setLoad({ status: 'ready', data })
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ status: 'error', message: (err as Error).message })
      })
    return () => {
      cancelled = true
    }
  }, [ticket.key])

  const d = load.status === 'ready' ? load.data : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${ticket.key}`}
        className="w-full max-w-3xl rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <a
              href={d?.url ?? ticket.url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm font-semibold text-sky-700 hover:underline dark:text-sky-400"
            >
              {ticket.key} ↗
            </a>
            <h2 className="mt-0.5 text-base font-medium text-zinc-900 dark:text-zinc-100">
              {d?.summary ?? ticket.summary}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            ✕
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {load.status === 'loading' && (
            <p className="text-sm text-zinc-500">Trayendo el ticket de Jira…</p>
          )}

          {load.status === 'error' && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
              <p className="text-sm text-red-700 dark:text-red-400">{load.message}</p>
            </div>
          )}

          {d && (
            <>
              <dl className="mb-5 divide-y divide-zinc-100 rounded-lg border border-zinc-200 px-3 py-1 dark:divide-zinc-800 dark:border-zinc-800">
                <Meta label="Estado">
                  {d.status}
                  {d.resolution && <span className="text-zinc-500"> · {d.resolution}</span>}
                </Meta>
                <Meta label="Tipo">
                  {d.issueType}
                  {d.priority && <span className="text-zinc-500"> · {d.priority}</span>}
                </Meta>
                <Meta label="Asignado">
                  <Person person={d.assignee} />
                </Meta>
                <Meta label="Reporta">
                  <Person person={d.reporter} />
                </Meta>
                <Meta label="Actualizado">
                  {relativeTime(d.updated)}
                  <span className="text-zinc-400"> · creado {relativeTime(d.created)}</span>
                </Meta>
                {d.dueDate && <Meta label="Vence">{d.dueDate}</Meta>}
                {d.parent && (
                  <Meta label="Padre">
                    <a
                      href={d.parent.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-700 hover:underline dark:text-sky-400"
                    >
                      {d.parent.key} {d.parent.summary}
                    </a>
                  </Meta>
                )}
                {d.components.length > 0 && (
                  <Meta label="Componentes">{d.components.join(', ')}</Meta>
                )}
                {d.labels.length > 0 && <Meta label="Etiquetas">{d.labels.join(', ')}</Meta>}
              </dl>

              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  Descripción
                </h3>
                {d.description ? (
                  <Markdown>{d.description}</Markdown>
                ) : (
                  <p className="text-sm text-zinc-400">Este ticket no tiene descripción.</p>
                )}
              </section>

              {d.comments.length > 0 && (
                <section className="mt-6">
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                    Comentarios ({d.comments.length})
                  </h3>
                  <ul className="space-y-4">
                    {d.comments.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                      >
                        <div className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
                          {c.avatar && <img src={c.avatar} alt="" className="size-4 rounded-full" />}
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                            {c.author}
                          </span>
                          <span>{relativeTime(c.at)}</span>
                        </div>
                        <Markdown>{c.body}</Markdown>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
