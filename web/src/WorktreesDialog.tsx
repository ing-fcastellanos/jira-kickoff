import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WorktreeInfo, WorktreesResponse } from './types'
import { ApiError, getJson, postJson } from './api'
import { Button, Heading, Key, Modal, Note } from './ui'
import { useT } from './LocaleProvider'
import type { Key as MessageKey } from './i18n'

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: WorktreesResponse }

/** Row buttons: more compact than the header ones. */
const SMALL = 'px-2.5 py-1 text-[11.5px]'

function isRisky(w: WorktreeInfo): boolean {
  return w.dirty || w.unpushed > 0
}

/**
 * Whether deleting it loses nothing, and why.
 *
 * The rule is one line —nothing uncommitted and no commit that only lives here—
 * because that is exactly what cannot be recovered afterwards. Everything else
 * (the branch merged, the branch pushed) only changes the wording of the reason,
 * never the verdict.
 */
function verdict(w: WorktreeInfo): { safe: boolean; reason: MessageKey } {
  if (w.prunable) return { safe: true, reason: 'wt.rec.leftover' }
  if (w.dirty || w.unpushed > 0) return { safe: false, reason: 'wt.rec.keep' }
  if (w.merged) return { safe: true, reason: 'wt.rec.merged' }
  if (w.remoteBranchExists) return { safe: true, reason: 'wt.rec.pushed' }
  return { safe: true, reason: 'wt.rec.nothing' }
}

function Badges({ w }: { w: WorktreeInfo }) {
  const { t } = useT()
  const badges: { text: string; tone: string }[] = []

  // A dead entry has no state worth reporting: git stopped tracking its folder.
  if (w.prunable) {
    return <span className="badge shrink-0 bg-warn-bg font-mono text-warn">{t('wt.leftover')}</span>
  }

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
  selected,
  onSelect,
  locked,
  busyInBulk,
  bulkError,
  onRemoved,
}: {
  w: WorktreeInfo
  editorLabel: string
  selected: boolean
  onSelect: (path: string, selected: boolean) => void
  /** The bulk cleanup owns the list: the row does not act on its own meanwhile. */
  locked: boolean
  /** This row is the one the bulk cleanup is deleting right now. */
  busyInBulk: boolean
  /** Why the bulk cleanup could not delete this one. Outlives the run. */
  bulkError: string | null
  onRemoved: (path: string) => void
}) {
  const { t } = useT()
  const [confirming, setConfirming] = useState(false)
  const [alsoBranch, setAlsoBranch] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  /*
   * The server answered that it found work the listing had not seen —its check is
   * fresher than ours. Without keeping the flag the same button would repeat the
   * same rejected request forever.
   */
  const [needsForce, setNeedsForce] = useState(false)

  const risky = isRisky(w)
  const force = risky || needsForce || w.prunable
  const running = busy || busyInBulk

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
        force,
        deleteBranch: alsoBranch,
      })
      onRemoved(w.path)
    } catch (err) {
      if (err instanceof ApiError && err.body?.['needsForce'] === true) setNeedsForce(true)
      setError((err as Error).message)
      setBusy(false)
    }
  }, [w, force, alsoBranch, onRemoved])

  // What is lost is enumerated instead of saying "there are changes": the user
  // decides differently for unsaved edits than for commits they have not pushed.
  const losses = [
    w.dirty ? t('wt.losesUncommitted') : null,
    w.unpushed > 0 ? t('wt.losesUnpushed', { n: w.unpushed }) : null,
  ].filter(Boolean)

  return (
    <li className="flex flex-col gap-[7px] border-b border-line-soft px-3.5 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-[7px]">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(w.path, e.target.checked)}
          disabled={locked}
          aria-label={w.name}
          className="size-3.5 shrink-0 accent-[var(--accent)]"
        />
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
            disabled={confirming || locked}
          >
            {running ? t('wt.deleting') : t('common.delete')}
          </Button>
        </div>
      </div>

      {w.branch && <p className="truncate font-mono text-[11.5px] text-ink-6">{w.branch}</p>}

      {openError && <p className="text-[11.5px] text-danger">{openError}</p>}

      {bulkError && <p className="text-[11.5px] text-danger">{bulkError}</p>}

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
          {busy && <p className="text-[11.5px] text-ink-5">{t('wt.slow')}</p>}

          <div className="flex gap-2">
            <Button variant="danger" className={SMALL} onClick={() => void remove()} disabled={busy}>
              {busy ? t('wt.deleting') : force ? t('wt.deleteAnyway') : t('common.confirm')}
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

/**
 * The cleanup the panel proposes: what it would select, and why each one.
 *
 * It is shown before anything is selected because the answer to "which ones can
 * I delete" is a list of reasons, not a number.
 */
function Suggestion({
  safe,
  onSelect,
  onDismiss,
}: {
  safe: WorktreeInfo[]
  onSelect: () => void
  onDismiss: () => void
}) {
  const { t } = useT()

  if (safe.length === 0) {
    return (
      <Note tone="info" title={t('wt.suggestTitle')}>
        <p>{t('wt.suggestNone')}</p>
        <div className="mt-2.5">
          <Button variant="ghost" className={SMALL} onClick={onDismiss}>
            {t('common.close')}
          </Button>
        </div>
      </Note>
    )
  }

  return (
    <Note tone="info" title={t('wt.suggestTitle')}>
      <p>{t('wt.suggestBody', { n: safe.length })}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {safe.map((w) => (
          <li key={w.path} className="flex flex-wrap items-baseline gap-x-2 text-[11.5px]">
            <span className="font-mono text-ink">{w.name}</span>
            <span className="text-ink-5">{t(verdict(w).reason)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex gap-2">
        <Button variant="primary" className={SMALL} onClick={onSelect}>
          {t('wt.selectSafe', { n: safe.length })}
        </Button>
        <Button variant="ghost" className={SMALL} onClick={onDismiss}>
          {t('common.cancel')}
        </Button>
      </div>
    </Note>
  )
}

export default function WorktreesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [suggesting, setSuggesting] = useState(false)
  const [confirmingBulk, setConfirmingBulk] = useState(false)
  const [alsoMergedBranches, setAlsoMergedBranches] = useState(true)
  /** Null while nothing is running: it is also what unlocks the rows. */
  const [progress, setProgress] = useState<{
    total: number
    done: number
    /** Path and not name: two projects can have a worktree called the same. */
    path: string
    name: string
  } | null>(null)
  const [failures, setFailures] = useState<Map<string, string>>(new Map())
  const [deleted, setDeleted] = useState(0)

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
  const manageable = useMemo(
    () => all.filter((w) => w.managed && !w.isMain && !removed.has(w.path)),
    [all, removed],
  )
  const byProject = [...new Set(manageable.map((w) => w.projectKey))]
  const editorLabel = load.status === 'ready' ? load.data.editorLabel : '…'

  const safe = useMemo(() => manageable.filter((w) => verdict(w).safe), [manageable])
  const chosen = useMemo(() => manageable.filter((w) => selected.has(w.path)), [manageable, selected])
  const riskyChosen = chosen.filter(isRisky)

  const onSelect = useCallback((path: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(path)
      else next.delete(path)
      return next
    })
  }, [])

  /*
   * One at a time on purpose. They are `git worktree remove` on the same
   * repository —they would queue on its lock anyway— and each one deletes
   * thousands of files: firing them together only makes the failures harder to
   * attribute.
   */
  const runBulk = useCallback(async () => {
    const queue = [...chosen]
    setConfirmingBulk(false)
    setFailures(new Map())
    setDeleted(0)

    let done = 0
    let ok = 0
    for (const w of queue) {
      setProgress({ total: queue.length, done, path: w.path, name: w.name })
      try {
        await postJson('/api/worktrees/remove', {
          projectKey: w.projectKey,
          path: w.path,
          force: isRisky(w) || w.prunable,
          deleteBranch: alsoMergedBranches && w.merged && Boolean(w.branch),
        })
        ok += 1
        setDeleted(ok)
        onRemoved(w.path)
        onSelect(w.path, false)
      } catch (err) {
        setFailures((prev) => new Map(prev).set(w.path, (err as Error).message))
      }
      done += 1
    }

    setProgress(null)
  }, [chosen, alsoMergedBranches, onRemoved, onSelect])

  const running = progress !== null

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

        {manageable.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className={SMALL}
                onClick={() => setSuggesting(true)}
                disabled={running || suggesting}
              >
                {t('wt.suggest')}
              </Button>

              {chosen.length > 0 && (
                <>
                  <span className="text-[11.5px] text-ink-5">
                    {t('wt.selected', { n: chosen.length })}
                  </span>
                  <Button
                    variant="danger"
                    className={SMALL}
                    onClick={() => setConfirmingBulk(true)}
                    disabled={running || confirmingBulk}
                  >
                    {t('wt.deleteSelected', { n: chosen.length })}
                  </Button>
                  <Button
                    variant="ghost"
                    className={SMALL}
                    onClick={() => setSelected(new Set())}
                    disabled={running}
                  >
                    {t('wt.clearSelection')}
                  </Button>
                </>
              )}
            </div>

            {suggesting && !running && (
              <Suggestion
                safe={safe}
                onSelect={() => {
                  setSelected(new Set(safe.map((w) => w.path)))
                  setSuggesting(false)
                }}
                onDismiss={() => setSuggesting(false)}
              />
            )}

            {confirmingBulk && (
              <div className="flex flex-col gap-2.5 rounded-lg border border-danger-line bg-danger-panel px-3 py-3">
                <p className="text-xs leading-relaxed text-ink-3">
                  {t('wt.bulkConfirm', { n: chosen.length })}
                </p>
                {riskyChosen.length > 0 && (
                  <p className="text-xs leading-relaxed text-danger">
                    {t('wt.bulkRisky', {
                      n: riskyChosen.length,
                      names: riskyChosen.map((w) => w.name).join(', '),
                    })}
                  </p>
                )}
                <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-3">
                  <input
                    type="checkbox"
                    checked={alsoMergedBranches}
                    onChange={(e) => setAlsoMergedBranches(e.target.checked)}
                    className="size-3.5 accent-[var(--accent)]"
                  />
                  <span>{t('wt.bulkBranches')}</span>
                </label>
                <div className="flex gap-2">
                  <Button variant="danger" className={SMALL} onClick={() => void runBulk()}>
                    {t('wt.deleteSelected', { n: chosen.length })}
                  </Button>
                  <Button
                    variant="ghost"
                    className={SMALL}
                    onClick={() => setConfirmingBulk(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            )}

            {progress && (
              <Note tone="info">
                <p>
                  {t('wt.bulkRunning', {
                    done: progress.done + 1,
                    total: progress.total,
                    name: progress.name,
                  })}
                </p>
                <p className="mt-1 text-ink-5">{t('wt.slow')}</p>
              </Note>
            )}

            {!running && deleted > 0 && (
              <Note tone={failures.size > 0 ? 'warn' : 'ok'}>
                {t('wt.bulkDone', { n: deleted })}
                {failures.size > 0 && ` ${t('wt.bulkFailed', { n: failures.size })}`}
              </Note>
            )}
          </div>
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
                  <Row
                    key={w.path}
                    w={w}
                    editorLabel={editorLabel}
                    selected={selected.has(w.path)}
                    onSelect={onSelect}
                    locked={running}
                    busyInBulk={progress?.path === w.path}
                    bulkError={failures.get(w.path) ?? null}
                    onRemoved={onRemoved}
                  />
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </Modal>
  )
}
