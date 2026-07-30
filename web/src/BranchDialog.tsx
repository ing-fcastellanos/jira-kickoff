import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Branch, BranchesResponse, InitializeResult, PromptResponse, Ticket } from './types'
import { getJson, postJson } from './api'

/** Un repo veterano pasa de 600 ramas: pintarlas todas cuelga la lista y no ayuda. */
const MAX_VISIBLE = 30

/** El prompt se recompone al cambiar de rama; sin esperar, se recompone en cada tecla. */
const REBUILD_DELAY_MS = 300

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: BranchesResponse }

const ACTION_LABEL: Record<InitializeResult['branchAction'], string> = {
  'created-from-base': 'Rama nueva, creada desde la base',
  'checked-out-local': 'Rama local existente, worktree nuevo',
  'tracked-remote': 'Rama traída del remoto',
  'reused-worktree': 'Worktree ya existente, reutilizado',
}

function Tag({ branch }: { branch: Branch }) {
  const label = branch.remote && branch.local ? 'remota + local' : branch.remote ? 'remota' : 'local'
  return <span className="shrink-0 text-xs text-zinc-400">{label}</span>
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1800)
        })
      }}
      className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
    >
      {done ? 'Copiado ✓' : label}
    </button>
  )
}

export default function BranchDialog({
  ticket,
  onClose,
  onInitialized,
}: {
  ticket: Ticket
  onClose: () => void
  onInitialized: () => void
}) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [branchName, setBranchName] = useState('')
  const [filter, setFilter] = useState('')

  const [prompt, setPrompt] = useState('')
  const [promptMeta, setPromptMeta] = useState<Pick<
    PromptResponse,
    'maxLength' | 'warnLength'
  > | null>(null)
  // Una vez que tocas el prompt, cambiar de rama deja de sobrescribirlo.
  const promptDirty = useRef(false)

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<InitializeResult | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setLoad({ status: 'loading' })
    getJson<BranchesResponse>(`/api/branches/${ticket.key}`)
      .then((data) => {
        if (cancelled) return
        setLoad({ status: 'ready', data })
        setBranchName(data.suggested)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ status: 'error', message: (err as Error).message })
      })
    return () => {
      cancelled = true
    }
  }, [ticket.key])

  // El prompt puede contener {{branch}} y {{worktree}}, asi que se recompone en
  // el servidor —donde vive la plantilla— cada vez que cambia la rama elegida.
  useEffect(() => {
    if (!branchName || promptDirty.current) return
    let cancelled = false
    const timer = setTimeout(() => {
      const url = `/api/prompt/${ticket.key}?branch=${encodeURIComponent(branchName)}`
      getJson<PromptResponse>(url)
        .then((data) => {
          if (cancelled || promptDirty.current) return
          setPrompt(data.prompt)
          setPromptMeta({ maxLength: data.maxLength, warnLength: data.warnLength })
        })
        .catch(() => {
          /* el error real ya se vera al inicializar */
        })
    }, REBUILD_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [ticket.key, branchName])

  const data = load.status === 'ready' ? load.data : null

  const filtered = useMemo(() => {
    if (!data) return []
    const q = filter.trim().toLowerCase()
    const list = q ? data.branches.filter((b) => b.name.toLowerCase().includes(q)) : data.branches
    return list.slice(0, MAX_VISIBLE)
  }, [data, filter])

  const existing = data?.branches.find((b) => b.name === branchName.trim()) ?? null
  const hidden = data && filter.trim() ? 0 : (data?.branches.length ?? 0) - filtered.length
  const tooLong = promptMeta ? prompt.length > promptMeta.maxLength : false
  const nearLimit = promptMeta ? prompt.length > promptMeta.warnLength && !tooLong : false
  const canSubmit = Boolean(branchName.trim() && prompt.trim() && !tooLong && !submitting)

  const submit = useCallback(async () => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await postJson<InitializeResult>('/api/initialize', {
        ticketKey: ticket.key,
        branch: branchName.trim(),
        prompt,
      })
      setResult(res)
      onInitialized()
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }, [ticket.key, branchName, prompt, onInitialized])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Inicializar ${ticket.key}`}
        className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold text-sky-700 dark:text-sky-400">
              {ticket.key}
            </p>
            <h2 className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">{ticket.summary}</h2>
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
          {result ? (
            <ResultView result={result} onClose={onClose} />
          ) : (
            <>
              {load.status === 'loading' && (
                <p className="text-sm text-zinc-500">Leyendo ramas del remoto…</p>
              )}

              {load.status === 'error' && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
                  <p className="text-sm text-red-700 dark:text-red-400">{load.message}</p>
                </div>
              )}

              {data && (
                <>
                  <p className="mb-4 text-xs text-zinc-500">
                    <span className="font-mono">{data.repo}</span> · parte de{' '}
                    <span className="font-mono">{data.baseBranch}</span>
                  </p>

                  {data.remoteError && (
                    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
                      <p className="text-sm text-amber-800 dark:text-amber-400">
                        No pude leer el remoto, la lista es solo local: {data.remoteError}
                      </p>
                    </div>
                  )}

                  {data.matches.length > 0 && (
                    <div className="mb-4 rounded-lg border border-sky-300 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/40">
                      <p className="text-sm font-medium text-sky-900 dark:text-sky-300">
                        Ya hay {data.matches.length === 1 ? 'una rama' : 'ramas'} para este ticket
                      </p>
                      <ul className="mt-2 space-y-1">
                        {data.matches.map((b) => (
                          <li key={b.name}>
                            <button
                              type="button"
                              onClick={() => setBranchName(b.name)}
                              className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-sky-100 dark:hover:bg-sky-900/50"
                            >
                              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                                {b.name}
                              </span>
                              <Tag branch={b} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <label className="block text-sm font-medium" htmlFor="branch">
                    Rama
                  </label>
                  <input
                    id="branch"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    spellCheck={false}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    {branchName.trim() === '' ? (
                      <span className="text-amber-600 dark:text-amber-400">Escribe un nombre.</span>
                    ) : existing ? (
                      <>
                        Ya existe (
                        {existing.remote && existing.local
                          ? 'remota y local'
                          : existing.remote
                            ? 'solo remota'
                            : 'solo local'}
                        ) · se retomará en vez de crearse
                      </>
                    ) : (
                      <>Rama nueva · se creará desde {data.baseBranch}</>
                    )}
                  </p>

                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      Ramas existentes{' '}
                      <span className="font-normal text-zinc-400">({data.branches.length})</span>
                    </summary>
                    <input
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Buscar…"
                      spellCheck={false}
                      className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <ul className="mt-2 max-h-44 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800">
                      {filtered.length === 0 && (
                        <li className="px-3 py-2 text-sm text-zinc-500">Ninguna rama coincide.</li>
                      )}
                      {filtered.map((b) => (
                        <li key={b.name}>
                          <button
                            type="button"
                            onClick={() => setBranchName(b.name)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
                          >
                            <span className="min-w-0 flex-1 truncate font-mono text-xs">
                              {b.name}
                            </span>
                            <Tag branch={b} />
                          </button>
                        </li>
                      ))}
                    </ul>
                    {hidden > 0 && (
                      <p className="mt-1 text-xs text-zinc-400">
                        y {hidden} más. Usa el buscador para acotar.
                      </p>
                    )}
                  </details>

                  <div className="mt-5 flex items-baseline justify-between">
                    <label className="text-sm font-medium" htmlFor="prompt">
                      Prompt inicial
                    </label>
                    <span
                      className={`text-xs ${
                        tooLong
                          ? 'font-medium text-red-600 dark:text-red-400'
                          : nearLimit
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-zinc-400'
                      }`}
                    >
                      {prompt.length}
                      {promptMeta ? ` / ${promptMeta.maxLength}` : ''}
                    </span>
                  </div>
                  <textarea
                    id="prompt"
                    value={prompt}
                    onChange={(e) => {
                      promptDirty.current = true
                      setPrompt(e.target.value)
                    }}
                    rows={7}
                    spellCheck={false}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs leading-relaxed dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    {tooLong ? (
                      <span className="text-red-600 dark:text-red-400">
                        Excede lo que acepta la app; se truncaría.
                      </span>
                    ) : nearLimit ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        Muy largo: al codificarse puede acercarse al tope de la línea de comandos.
                      </span>
                    ) : (
                      'Se envía tal cual lo ves. Nada se añade por detrás.'
                    )}
                  </p>

                  {submitError && (
                    <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
                      <p className="text-sm text-red-700 dark:text-red-400">{submitError}</p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {!result && (
          <footer className="flex items-center justify-end gap-3 border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600"
            >
              {submitting ? 'Creando worktree…' : 'Crear worktree y abrir sesión'}
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}

function ResultView({ result, onClose }: { result: InitializeResult; onClose: () => void }) {
  const promptFromLink = decodeURIComponent(
    result.deepLink.split('?q=')[1]?.split('&folder=')[0] ?? '',
  )

  return (
    <div>
      <div
        className={`rounded-lg border p-4 ${
          result.launched || result.launchMode === 'clipboard'
            ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40'
            : 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
        }`}
      >
        <p className="text-sm font-medium">
          {result.launched
            ? 'Sesión enviada a Claude Code'
            : result.launchMode === 'clipboard'
              ? 'Worktree listo'
              : 'Worktree listo, pero no pude abrir la sesión'}
        </p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {result.launched
            ? 'Busca la ventana de Claude Code: el prompt está escrito, esperando tu Enter.'
            : result.launchMode === 'clipboard'
              ? 'Copia el prompt y pégalo en una sesión nueva sobre esa carpeta.'
              : result.launchError}
        </p>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex gap-3">
          <dt className="w-20 shrink-0 text-zinc-500">Rama</dt>
          <dd className="min-w-0 font-mono text-xs break-all">{result.branch}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-20 shrink-0 text-zinc-500">Worktree</dt>
          <dd className="min-w-0 font-mono text-xs break-all">{result.worktree}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-20 shrink-0 text-zinc-500">Qué pasó</dt>
          <dd className="min-w-0">{ACTION_LABEL[result.branchAction]}</dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <CopyButton text={promptFromLink} label="Copiar prompt" />
        <CopyButton text={result.worktree} label="Copiar ruta" />
        {!result.launched && result.launchMode === 'open' && (
          <a
            href={result.deepLink}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Abrir el enlace a mano
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Listo
        </button>
      </div>
    </div>
  )
}
