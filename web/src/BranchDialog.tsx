import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Branch, BranchesResponse, InitializeResult, PromptResponse, Ticket } from './types'
import { getJson, postJson } from './api'
import { Button, Key, Modal, Note, inputClass, monoInputClass } from './ui'
import { useT } from './LocaleProvider'
import type { Key as MsgKey } from './i18n'

/** Un repo veterano pasa de 600 ramas: pintarlas todas cuelga la lista y no ayuda. */
const MAX_VISIBLE = 30

/** El prompt se recompone al cambiar de rama; sin esperar, se recompone en cada tecla. */
const REBUILD_DELAY_MS = 300

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: BranchesResponse }

const ACTION_KEY: Record<InitializeResult['branchAction'], MsgKey> = {
  'created-from-base': 'action.created-from-base',
  'checked-out-local': 'action.checked-out-local',
  'tracked-remote': 'action.tracked-remote',
  'reused-worktree': 'action.reused-worktree',
}

const FORM_LABEL = 'text-[12.5px] font-semibold text-ink-3'

function BranchRow({
  branch,
  onPick,
  bordered,
}: {
  branch: Branch
  onPick: (name: string) => void
  bordered?: boolean
}) {
  const { t } = useT()
  const origin =
    branch.remote && branch.local
      ? t('branch.originRemoteLocal')
      : branch.remote
        ? t('branch.originRemote')
        : t('branch.originLocal')

  return (
    <button
      type="button"
      onClick={() => onPick(branch.name)}
      className={`flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-1.5 text-left hover:bg-control ${
        bordered ? 'border-b border-line-soft last:border-b-0' : 'rounded-md'
      }`}
    >
      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-2">
        {branch.name}
      </span>
      <span className="shrink-0 text-[11px] text-ink-6">{origin}</span>
    </button>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useT()
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="quiet"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1800)
        })
      }}
    >
      {done ? t('common.copied') : label}
    </Button>
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
  const { t } = useT()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [branchName, setBranchName] = useState('')
  const [filter, setFilter] = useState('')
  const [listOpen, setListOpen] = useState(false)

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
      getJson<PromptResponse>(`/api/prompt/${ticket.key}?branch=${encodeURIComponent(branchName)}`)
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

  const whereExists = existing
    ? existing.remote && existing.local
      ? t('branch.existsRemoteLocal')
      : existing.remote
        ? t('branch.existsRemote')
        : t('branch.existsLocal')
    : ''

  return (
    <Modal
      label={`${t('card.initialize')} ${ticket.key}`}
      onClose={onClose}
      title={
        <>
          <Key>{ticket.key}</Key>
          <h2 className="text-sm font-medium text-pretty text-ink-3">{ticket.summary}</h2>
        </>
      }
      footer={
        result ? undefined : (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={!canSubmit}>
              {submitting ? t('branch.submitting') : t('branch.submit')}
            </Button>
          </>
        )
      }
    >
      <div className="flex max-h-[70vh] flex-col gap-3.5 overflow-y-auto px-4.5 py-4">
        {result ? (
          <ResultView result={result} onClose={onClose} />
        ) : (
          <>
            {load.status === 'loading' && (
              <p className="text-[12.5px] text-ink-5">{t('branch.loading')}</p>
            )}

            {load.status === 'error' && <Note tone="danger">{load.message}</Note>}

            {data && (
              <>
                <p className="font-mono text-[11.5px] break-all text-ink-6">
                  {data.repo} <span className="text-line-strong">·</span> {t('branch.partOf')}{' '}
                  <span className="text-ok">{data.baseBranch}</span>
                </p>

                {data.remoteError && (
                  <Note tone="warn" title={t('branch.noRemoteTitle')}>
                    {t('branch.noRemote', { error: data.remoteError })}
                  </Note>
                )}

                {data.matches.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-lg border border-info-line bg-info-panel px-3 py-3">
                    <p className="text-[12.5px] font-semibold text-info">
                      <span className="syntax opacity-70">&gt; </span>
                      {data.matches.length === 1 ? t('branch.matchesOne') : t('branch.matchesMany')}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {data.matches.map((b) => (
                        <BranchRow key={b.name} branch={b} onPick={setBranchName} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="branch" className={FORM_LABEL}>
                    {t('branch.label')}
                  </label>
                  <input
                    id="branch"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    spellCheck={false}
                    className={`${monoInputClass} text-[13px]`}
                  />
                  <p className="text-[11.5px] text-ink-5">
                    {branchName.trim() === '' ? (
                      <span className="text-warn">{t('branch.needName')}</span>
                    ) : existing ? (
                      t('branch.willReuse', { where: whereExists })
                    ) : (
                      t('branch.willCreate', { base: data.baseBranch })
                    )}
                  </p>
                </div>

                <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
                  <button
                    type="button"
                    onClick={() => setListOpen((v) => !v)}
                    className={`flex cursor-pointer items-center gap-[7px] self-start ${FORM_LABEL}`}
                  >
                    <span className="syntax">{listOpen ? '▾' : '▸'}</span>
                    <span>
                      {t('branch.existing')}{' '}
                      <span className="font-normal text-ink-6">({data.branches.length})</span>
                    </span>
                  </button>

                  {listOpen && (
                    <div className="flex flex-col gap-2">
                      <input
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder={t('common.search')}
                        spellCheck={false}
                        className={inputClass}
                      />
                      <div className="max-h-[168px] overflow-y-auto rounded-md border border-line bg-input">
                        {filtered.length === 0 && (
                          <p className="px-2.5 py-2 text-[11.5px] text-ink-6">
                            {t('branch.noneMatch')}
                          </p>
                        )}
                        {filtered.map((b) => (
                          <BranchRow key={b.name} branch={b} onPick={setBranchName} bordered />
                        ))}
                      </div>
                      {hidden > 0 && (
                        <p className="text-[11.5px] text-ink-6">
                          {t('branch.andMore', { n: hidden })}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <label htmlFor="prompt" className={FORM_LABEL}>
                      {t('branch.prompt')}
                    </label>
                    <span
                      className={`font-mono text-[11.5px] ${
                        tooLong ? 'text-danger' : nearLimit ? 'text-warn' : 'text-ink-6'
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
                    rows={8}
                    spellCheck={false}
                    className={`${monoInputClass} resize-y text-[11.5px] leading-[1.65] text-ink-2`}
                  />
                  <p className="text-[11.5px] text-ink-5">
                    {tooLong ? (
                      <span className="text-danger">{t('branch.promptTooLong')}</span>
                    ) : nearLimit ? (
                      <span className="text-warn">{t('branch.promptNearLimit')}</span>
                    ) : (
                      t('branch.promptPlain')
                    )}
                  </p>
                </div>

                {submitError && <Note tone="danger">{submitError}</Note>}
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

function ResultView({ result, onClose }: { result: InitializeResult; onClose: () => void }) {
  const { t } = useT()
  const promptFromLink = decodeURIComponent(
    result.deepLink.split('?q=')[1]?.split('&folder=')[0] ?? '',
  )
  const ok = result.launched || result.launchMode === 'clipboard'

  const title = result.launched
    ? t('result.launched')
    : result.launchMode === 'clipboard'
      ? t('result.clipboard')
      : t('result.failed')

  const body = result.launched
    ? t('result.launchedBody')
    : result.launchMode === 'clipboard'
      ? t('result.clipboardBody')
      : result.launchError

  const rows: [string, string, boolean][] = [
    [t('result.branch'), result.branch, true],
    [t('result.worktree'), result.worktree, true],
    [t('result.what'), t(ACTION_KEY[result.branchAction]), false],
  ]

  return (
    <div className="flex flex-col gap-4">
      <Note tone={ok ? 'ok' : 'warn'} title={title}>
        {body}
      </Note>

      <dl className="flex flex-col gap-2">
        {rows.map(([label, value, mono]) => (
          <div key={label} className="flex gap-3">
            <dt className="w-[86px] shrink-0 text-xs text-ink-5">{label}</dt>
            <dd
              className={`min-w-0 break-all ${
                mono ? 'font-mono text-[11.5px] text-ink-2' : 'text-[12.5px] text-ink-3'
              }`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={promptFromLink} label={t('result.copyPrompt')} />
        <CopyButton text={result.worktree} label={t('result.copyPath')} />
        {!result.launched && result.launchMode === 'open' && (
          <a
            href={result.deepLink}
            className="rounded-md border border-line-strong bg-control px-3 py-1.5 text-xs font-medium text-ink-3 hover:bg-control-hover"
          >
            {t('result.openManually')}
          </a>
        )}
        <Button variant="primary" onClick={onClose} className="ml-auto">
          {t('common.done')}
        </Button>
      </div>
    </div>
  )
}
