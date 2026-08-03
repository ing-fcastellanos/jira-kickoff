import { useEffect, useState } from 'react'
import type { Ticket, TicketDetail } from './types'
import { getJson } from './api'
import Markdown from './Markdown'
import { Key, Modal, Note } from './ui'
import { useT } from './LocaleProvider'

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: TicketDetail }

function statusBadge(d: TicketDetail): string {
  if (d.status.toLowerCase() === 'rejected') return 'bg-danger-bg text-danger'
  switch (d.statusCategory) {
    case 'new':
      return 'bg-info-bg text-info'
    case 'indeterminate':
      return 'bg-warn-bg text-warn'
    default:
      return 'bg-ok-bg text-ok'
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase()
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  if (src) return <img src={src} alt="" className="size-[17px] shrink-0 rounded-full" />
  return (
    <span className="inline-flex size-[17px] shrink-0 items-center justify-center rounded-full bg-avatar text-[9px] text-ink-3">
      {initials(name)}
    </span>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-line-soft py-[7px] last:border-b-0">
      <dt className="w-[100px] shrink-0 text-[11.5px] text-ink-5">{label}</dt>
      <dd className="min-w-0 text-xs text-ink-2">{children}</dd>
    </div>
  )
}

function Person({ person, empty }: { person: { name: string; avatar: string | null } | null; empty: string }) {
  if (!person) return <span className="text-ink-6">{empty}</span>
  return (
    <span className="flex items-center gap-[7px]">
      <Avatar name={person.name} src={person.avatar} />
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
  const { t, rel } = useT()
  const [load, setLoad] = useState<Load>({ status: 'loading' })

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
    <Modal
      label={`Detalle de ${ticket.key}`}
      maxWidth="max-w-[800px]"
      onClose={onClose}
      title={
        <>
          <a
            href={d?.url ?? ticket.url}
            target="_blank"
            rel="noreferrer"
            className="w-fit hover:underline"
          >
            <Key>{ticket.key}</Key>
            <span className="ml-1 font-mono text-[13px] text-ok">↗</span>
          </a>
          <h2 className="text-[16px] leading-snug font-semibold tracking-tight text-pretty text-ink">
            <span className="syntax">### </span>
            {d?.summary ?? ticket.summary}
          </h2>
        </>
      }
    >
      <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto px-4.5 py-4">
        {load.status === 'loading' && (
          <p className="text-[12.5px] text-ink-5">{t('detail.loading')}</p>
        )}

        {load.status === 'error' && <Note tone="danger">{load.message}</Note>}

        {d && (
          <>
            <dl className="rounded-lg border border-line bg-panel px-3 py-0.5">
              <Row label={t('detail.status')}>
                <span className={`badge ${statusBadge(d)}`}>{d.status}</span>
                {d.resolution && <span className="ml-2 text-ink-6">{d.resolution}</span>}
              </Row>
              <Row label={t('detail.type')}>
                {d.issueType}
                {d.priority && <span className="text-ink-6"> · {d.priority}</span>}
              </Row>
              <Row label={t('detail.assignee')}>
                <Person person={d.assignee} empty={t('detail.unassigned')} />
              </Row>
              <Row label={t('detail.reporter')}>
                <Person person={d.reporter} empty={t('detail.unassigned')} />
              </Row>
              <Row label={t('detail.updated')}>
                {rel(d.updated)}
                <span className="text-ink-6">
                  {' · '}
                  {t('detail.createdSuffix', { time: rel(d.created) })}
                </span>
              </Row>
              {d.dueDate && (
                <Row label={t('detail.due')}>
                  <span className="font-mono text-[11.5px] text-warn">{d.dueDate}</span>
                </Row>
              )}
              {d.parent && (
                <Row label={t('detail.parent')}>
                  <a
                    href={d.parent.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline hover:underline-offset-2"
                  >
                    <span className="font-mono">{d.parent.key}</span> {d.parent.summary}
                  </a>
                </Row>
              )}
              {d.components.length > 0 && (
                <Row label={t('detail.components')}>{d.components.join(', ')}</Row>
              )}
              {d.labels.length > 0 && (
                <Row label={t('detail.labels')}>
                  <span className="flex flex-wrap gap-1.5">
                    {d.labels.map((l) => (
                      <span key={l} className="badge bg-accent-soft font-mono text-accent">
                        {l}
                      </span>
                    ))}
                  </span>
                </Row>
              )}
            </dl>

            <section className="flex flex-col gap-2.5">
              <h3 className="label">## {t('detail.description')}</h3>
              {d.description ? (
                <Markdown>{d.description}</Markdown>
              ) : (
                <p className="text-[12.5px] text-ink-5">{t('detail.noDescription')}</p>
              )}
            </section>

            {d.comments.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <h3 className="label">
                  ## {t('detail.comments')} ({d.comments.length})
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {d.comments.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-col gap-1.5 rounded-lg border border-line bg-panel px-3.5 py-3"
                    >
                      <div className="flex items-center gap-2 text-[11.5px] text-ink-5">
                        <Avatar name={c.author} src={c.avatar} />
                        <span className="font-semibold text-ink-3">{c.author}</span>
                        <span>{rel(c.at)}</span>
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
    </Modal>
  )
}
