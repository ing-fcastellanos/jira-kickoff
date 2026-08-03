import { useCallback, useEffect, useState } from 'react'
import type { WorktreeInfo, WorktreesResponse } from './types'
import { getJson, postJson } from './api'
import { Button, Heading, Key, Modal, Note } from './ui'
import { useT } from './LocaleProvider'

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: WorktreesResponse }

/** Botones de fila: mas compactos que los de cabecera. */
const SMALL = 'px-2.5 py-1 text-[11.5px]'

function isRisky(w: WorktreeInfo): boolean {
  return w.dirty || w.unpushed > 0
}

function Badges({ w }: { w: WorktreeInfo }) {
  const { t } = useT()
  const badges: { text: string; tone: string }[] = []

  if (w.dirty) badges.push({ text: t('wt.uncommitted'), tone: 'bg-danger-bg text-danger' })
  if (w.unpushed > 0)
    badges.push({ text: t('wt.unpushed', { n: w.unpushed }), tone: 'bg-danger-bg text-danger' })
  if (!w.branch) badges.push({ text: t('wt.noBranch'), tone: 'bg-control text-ink-4' })
  if (w.merged) badges.push({ text: t('wt.merged'), tone: 'bg-ok-bg text-ok' })
  if (w.branch && !w.remoteBranchExists)
    badges.push({ text: t('wt.notOnRemote'), tone: 'bg-warn-bg text-warn' })

  return (
    <>
      {badges.map((b) => (
        <span key={b.text} className={`badge shrink-0 font-mono ${b.tone}`}>
          {b.text}
        </span>
      ))}
    </>
  )
}

function Row({
  w,
  editorLabel,
  onRemoved,
}: {
  w: WorktreeInfo
  editorLabel: string
  onRemoved: (path: string) => void
}) {
  const { t } = useT()
  const [confirming, setConfirming] = useState(false)
  const [alsoBranch, setAlsoBranch] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)

  const risky = isRisky(w)

  const open = useCallback(async () => {
    setOpening(true)
    setOpenError(null)
    try {
      await postJson('/api/worktrees/open-editor', { projectKey: w.projectKey, path: w.path })
    } catch (err) {
      setOpenError((err as Error).message)
    } finally {
      setOpening(false)
    }
  }, [w.projectKey, w.path])

  const remove = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await postJson('/api/worktrees/remove', {
        projectKey: w.projectKey,
        path: w.path,
        force: risky,
        deleteBranch: alsoBranch,
      })
      onRemoved(w.path)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }, [w, risky, alsoBranch, onRemoved])

  // Se enumera lo que se pierde en vez de decir "hay cambios": el usuario
  // decide distinto si son ediciones sin guardar o commits que no ha subido.
  const losses = [
    w.dirty ? t('wt.losesUncommitted') : null,
    w.unpushed > 0 ? t('wt.losesUnpushed', { n: w.unpushed }) : null,
  ].filter(Boolean)

  return (
    <li className="flex flex-col gap-[7px] border-b border-line-soft px-3.5 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-[7px]">
        <span className="font-mono text-xs font-medium text-ink">{w.name}</span>
        <Badges w={w} />
        <div className="ml-auto flex shrink-0 gap-1.5">
          <Button variant="quiet" className={SMALL} onClick={() => void open()} disabled={opening}>
            {opening ? t('wt.opening') : t('wt.openIn', { editor: editorLabel })}
          </Button>
          <Button
            variant="quiet"
            className={SMALL}
            onClick={() => setConfirming(true)}
            disabled={confirming}
          >
            {t('common.delete')}
          </Button>
        </div>
      </div>

      {w.branch && <p className="truncate font-mono text-[11.5px] text-ink-6">{w.branch}</p>}

      {openError && <p className="text-[11.5px] text-danger">{openError}</p>}

      {confirming && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-danger-line bg-danger-panel px-3 py-3">
          <p className="text-xs leading-relaxed">
            {risky ? (
              <span className="text-danger">{t('wt.loses', { what: losses.join(' + ') })}</span>
            ) : (
              <span className="text-ink-3">{t('wt.safeDelete')}</span>
            )}
          </p>

          {w.branch && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-3">
              <input
                type="checkbox"
                checked={alsoBranch}
                onChange={(e) => setAlsoBranch(e.target.checked)}
                className="size-3.5 accent-[var(--accent)]"
              />
              <span>
                {t('wt.alsoBranch')} {!w.merged && <span className="text-warn">{t('wt.notMerged')}</span>}
              </span>
            </label>
          )}

          {error && <p className="text-[11.5px] text-danger">{error}</p>}

          <div className="flex gap-2">
            <Button variant="danger" className={SMALL} onClick={() => void remove()} disabled={busy}>
              {busy ? t('wt.deleting') : risky ? t('wt.deleteAnyway') : t('common.confirm')}
            </Button>
            <Button
              variant="ghost"
              className={SMALL}
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

export default function WorktreesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [removed, setRemoved] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    getJson<WorktreesResponse>('/api/worktrees')
      .then((data) => {
        if (!cancelled) setLoad({ status: 'ready', data })
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ status: 'error', message: (err as Error).message })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const onRemoved = useCallback((path: string) => {
    setRemoved((prev) => new Set(prev).add(path))
  }, [])

  const all = load.status === 'ready' ? load.data.worktrees : []
  const manageable = all.filter((w) => w.managed && !w.isMain && !removed.has(w.path))
  const byProject = [...new Set(manageable.map((w) => w.projectKey))]
  const editorLabel = load.status === 'ready' ? load.data.editorLabel : '…'

  return (
    <Modal
      label={t('wt.title')}
      onClose={onClose}
      title={
        <Heading level={2} hint={t('wt.subtitle')}>
          {t('wt.title')}
        </Heading>
      }
    >
      <div className="flex max-h-[70vh] flex-col gap-[18px] overflow-y-auto px-4.5 py-4">
        {load.status === 'loading' && <p className="text-[12.5px] text-ink-5">{t('wt.loading')}</p>}

        {load.status === 'error' && <Note tone="danger">{load.message}</Note>}

        {load.status === 'ready' &&
          load.data.errors.map((e) => (
            <Note key={e.projectKey} tone="warn">
              <span className="font-mono text-warn">{e.projectKey}</span>: {e.error}
            </Note>
          ))}

        {load.status === 'ready' && manageable.length === 0 && (
          <p className="py-8 text-center text-[12.5px] text-ink-5">{t('wt.empty')}</p>
        )}

        {byProject.map((projectKey) => {
          const items = manageable.filter((w) => w.projectKey === projectKey)
          return (
            <section key={projectKey} className="flex flex-col gap-2.5">
              <h3 className="flex items-baseline gap-[9px]">
                <Key>{projectKey}</Key>
                <span className="text-[11.5px] text-ink-6">{items.length}</span>
              </h3>
              <ul className="overflow-hidden rounded-lg border border-line bg-panel">
                {items.map((w) => (
                  <Row key={w.path} w={w} editorLabel={editorLabel} onRemoved={onRemoved} />
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </Modal>
  )
}
