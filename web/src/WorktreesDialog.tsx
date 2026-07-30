import { useCallback, useEffect, useState } from 'react'
import type { WorktreeInfo, WorktreesResponse } from './types'
import { getJson, postJson } from './api'

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: WorktreesResponse }

function isRisky(w: WorktreeInfo): boolean {
  return w.dirty || w.unpushed > 0
}

function Badges({ w }: { w: WorktreeInfo }) {
  const badges: { label: string; className: string }[] = []

  if (w.dirty) {
    badges.push({
      label: 'sin commitear',
      className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    })
  }
  if (w.unpushed > 0) {
    badges.push({
      label: `${w.unpushed} sin subir`,
      className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    })
  }
  if (!w.branch) {
    badges.push({
      label: 'sin rama',
      className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
    })
  }
  if (w.merged) {
    badges.push({
      label: 'fusionada',
      className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    })
  }
  if (w.branch && !w.remoteBranchExists) {
    badges.push({
      label: 'no está en el remoto',
      className: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
    })
  }

  return (
    <>
      {badges.map((b) => (
        <span key={b.label} className={`rounded px-1.5 py-0.5 text-xs ${b.className}`}>
          {b.label}
        </span>
      ))}
    </>
  )
}

function Row({ w, onRemoved }: { w: WorktreeInfo; onRemoved: (path: string) => void }) {
  const [confirming, setConfirming] = useState(false)
  const [alsoBranch, setAlsoBranch] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const risky = isRisky(w)

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

  return (
    <li className="border-b border-zinc-100 px-4 py-3 last:border-b-0 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-xs font-medium">{w.name}</span>
        <Badges w={w} />
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="ml-auto rounded-md border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Borrar
          </button>
        )}
      </div>

      {w.branch && (
        <p className="mt-1 truncate font-mono text-xs text-zinc-500">{w.branch}</p>
      )}

      {confirming && (
        <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs text-zinc-700 dark:text-zinc-300">
            {risky ? (
              <span className="text-red-700 dark:text-red-400">
                Tiene {w.dirty ? 'cambios sin commitear' : ''}
                {w.dirty && w.unpushed > 0 ? ' y ' : ''}
                {w.unpushed > 0 ? `${w.unpushed} commit(s) sin subir` : ''}. Se pierden.
              </span>
            ) : (
              'Se borra la carpeta del worktree. Nada más.'
            )}
          </p>

          {w.branch && (
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={alsoBranch}
                onChange={(e) => setAlsoBranch(e.target.checked)}
              />
              Borrar también la rama local{' '}
              {!w.merged && (
                <span className="text-amber-600 dark:text-amber-400">(no está fusionada)</span>
              )}
            </label>
          )}

          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? 'Borrando…' : risky ? 'Borrar de todos modos' : 'Confirmar'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-md px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

export default function WorktreesDialog({ onClose }: { onClose: () => void }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [removed, setRemoved] = useState<Set<string>>(new Set())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Worktrees"
        className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold">Worktrees</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Solo los que viven en la carpeta de worktrees de cada repo.
            </p>
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

        <div className="px-5 py-4">
          {load.status === 'loading' && (
            <p className="text-sm text-zinc-500">Inspeccionando repos…</p>
          )}

          {load.status === 'error' && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
              <p className="text-sm text-red-700 dark:text-red-400">{load.message}</p>
            </div>
          )}

          {load.status === 'ready' && load.data.errors.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
              {load.data.errors.map((e) => (
                <p key={e.projectKey} className="text-sm text-amber-800 dark:text-amber-400">
                  {e.projectKey}: {e.error}
                </p>
              ))}
            </div>
          )}

          {load.status === 'ready' && manageable.length === 0 && (
            <p className="py-6 text-center text-sm text-zinc-500">
              No queda ningún worktree que limpiar.
            </p>
          )}

          <div className="space-y-5">
            {byProject.map((projectKey) => {
              const items = manageable.filter((w) => w.projectKey === projectKey)
              return (
                <section key={projectKey}>
                  <h3 className="mb-2 flex items-baseline gap-2">
                    <span className="font-mono text-sm font-semibold">{projectKey}</span>
                    <span className="text-xs text-zinc-400">{items.length}</span>
                  </h3>
                  <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800">
                    {items.map((w) => (
                      <Row key={w.path} w={w} onRemoved={onRemoved} />
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
