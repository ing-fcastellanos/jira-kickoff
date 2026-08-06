import { useCallback, useEffect, useState } from 'react'
import type { FileConfig, Placeholder, SettingsResponse } from './types'
import { getJson, postJson, putJson } from './api'
import { applyTheme, readTheme, type Theme } from './theme'
import {
  Button,
  Field,
  Heading,
  Key,
  Modal,
  ModelPicker,
  Note,
  inputClass,
  monoInputClass,
} from './ui'
import { useT } from './LocaleProvider'
import { LOCALES, LOCALE_NAMES, type Key as MsgKey, type Locale } from './i18n'

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: SettingsResponse }

const THEMES: { value: Theme; key: MsgKey }[] = [
  { value: 'light', key: 'set.themeLight' },
  { value: 'dark', key: 'set.themeDark' },
  { value: 'system', key: 'set.themeSystem' },
]

const PERMISSION_MODES: { value: FileConfig['launch']['permissionMode']; key: MsgKey }[] = [
  { value: 'inherit', key: 'set.permInherit' },
  { value: 'default', key: 'set.permDefault' },
  { value: 'plan', key: 'set.permPlan' },
  { value: 'acceptEdits', key: 'set.permAcceptEdits' },
  { value: 'auto', key: 'set.permAuto' },
  { value: 'bypassPermissions', key: 'set.permBypass' },
]

const MODEL_PRESETS: { value: string; key: MsgKey }[] = [
  { value: '', key: 'set.modelInherit' },
  { value: 'opus', key: 'set.modelOpus' },
  { value: 'sonnet', key: 'set.modelSonnet' },
  { value: 'haiku', key: 'set.modelHaiku' },
]

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-line-soft py-4 last:border-b-0">
      {children}
    </section>
  )
}

function Tokens({ items }: { items: Placeholder[] }) {
  const { t } = useT()
  return (
    <p className="text-[11.5px] text-ink-5">
      {t('set.available')}{' '}
      {items.map((p, i) => (
        <span key={p.token}>
          {i > 0 && ', '}
          <span className="font-mono text-ok" title={p.description}>
            {p.token}
          </span>
        </span>
      ))}
    </p>
  )
}

/** Editable list of strings: Jira statuses, prompt lines, arguments. */
function StringList({
  values,
  onChange,
  placeholder,
  addLabel,
  mono,
}: {
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
  addLabel: string
  mono?: boolean
}) {
  const { t } = useT()
  return (
    <div className="flex flex-col gap-2">
      {values.map((value, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
            className={mono ? monoInputClass : inputClass}
          />
          <button
            type="button"
            aria-label={t('common.remove')}
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="shrink-0 cursor-pointer rounded-md border border-line bg-panel px-3 font-mono text-xs text-ink-5 hover:border-danger-line hover:bg-danger-bg hover:text-danger"
          >
            ✕
          </button>
        </div>
      ))}
      <Button className="self-start" onClick={() => onChange([...values, ''])}>
        {addLabel}
      </Button>
    </div>
  )
}

export default function SettingsDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const { t, locale, setLocale } = useT()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [draft, setDraft] = useState<FileConfig | null>(null)
  const [theme, setTheme] = useState<Theme>(() => readTheme())
  const [newKey, setNewKey] = useState('')
  const [preview, setPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    getJson<SettingsResponse>('/api/settings')
      .then((data) => {
        if (cancelled) return
        setLoad({ status: 'ready', data })
        setDraft(structuredClone(data.config))
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ status: 'error', message: (err as Error).message })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Branch name preview: computed by the server, which is where the slug
  // normalization lives. Debounced, so it does not call on every keystroke.
  useEffect(() => {
    if (!draft) return
    let cancelled = false
    const timer = setTimeout(() => {
      postJson<{ example: string }>('/api/settings/preview-branch', {
        pattern: draft.branch.pattern,
        slugMaxLength: draft.branch.slugMaxLength,
      })
        .then((r) => {
          if (!cancelled) setPreview(r.example)
        })
        .catch(() => {
          if (!cancelled) setPreview('')
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [draft?.branch.pattern, draft?.branch.slugMaxLength])

  const patch = useCallback((fn: (d: FileConfig) => void) => {
    setSaved(false)
    setDraft((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      fn(next)
      return next
    })
  }, [])

  const save = useCallback(async () => {
    if (!draft) return
    setSaving(true)
    setSaveError(null)
    try {
      await putJson<{ config: FileConfig }>('/api/settings', draft)
      setSaved(true)
      onSaved()
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }, [draft, onSaved])

  const data = load.status === 'ready' ? load.data : null
  const projectKeys = draft ? Object.keys(draft.projects) : []

  return (
    <Modal
      label={t('set.title')}
      maxWidth="max-w-[700px]"
      onClose={onClose}
      title={
        <Heading level={2} hint={t('set.subtitle', { file: 'config.json' })}>
          {t('set.title')}
        </Heading>
      }
      footer={
        <>
          {saveError && (
            <p className="mr-auto text-[11.5px] whitespace-pre-line text-danger">{saveError}</p>
          )}
          {saved && !saveError && <p className="mr-auto text-[11.5px] text-ok">{t('common.saved')}</p>}
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!draft || saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <div className="max-h-[72vh] overflow-y-auto px-4.5">
        {load.status === 'loading' && (
          <p className="py-4 text-[12.5px] text-ink-5">{t('set.loading')}</p>
        )}

        {load.status === 'error' && (
          <div className="py-4">
            <Note tone="danger">{load.message}</Note>
          </div>
        )}

        {draft && data && (
          <>
            <Section>
              <Heading hint={t('set.appearanceHint')}>{t('set.appearance')}</Heading>

              <div className="flex flex-col gap-2">
                <span className="text-[11.5px] font-semibold text-ink-4">{t('set.language')}</span>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(LOCALES) as Locale[]).map((l) => (
                    <Button
                      key={l}
                      variant={locale === l ? 'selected' : 'default'}
                      onClick={() => setLocale(l)}
                    >
                      {LOCALE_NAMES[l]}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {THEMES.map((x) => (
                  <Button
                    key={x.value}
                    variant={theme === x.value ? 'selected' : 'default'}
                    onClick={() => {
                      setTheme(x.value)
                      applyTheme(x.value)
                    }}
                  >
                    {t(x.key)}
                  </Button>
                ))}
              </div>
            </Section>

            <Section>
              <Heading
                hint={
                  data.credentials.configured
                    ? t('set.jiraConnected', { email: data.credentials.email ?? '' })
                    : t('set.jiraMissing')
                }
              >
                {t('set.jira')}
              </Heading>

              <Field label={t('set.site')}>
                <input
                  value={draft.jira.site}
                  onChange={(e) => patch((d) => void (d.jira.site = e.target.value))}
                  placeholder="https://your-domain.atlassian.net"
                  spellCheck={false}
                  className={inputClass}
                />
              </Field>

              <div className="flex flex-col gap-2">
                <span className="text-[11.5px] font-semibold text-ink-4">{t('set.statuses')}</span>
                <StringList
                  values={draft.jira.statuses}
                  onChange={(next) => patch((d) => void (d.jira.statuses = next))}
                  placeholder="In Progress"
                  addLabel={t('set.addStatus')}
                />
                <p className="text-[11.5px] leading-relaxed text-pretty text-ink-5">
                  {t('set.statusesHint')}
                </p>
              </div>

              <Field label={t('set.extraJql')}>
                <input
                  value={draft.jira.extraJql}
                  onChange={(e) => patch((d) => void (d.jira.extraJql = e.target.value))}
                  placeholder="sprint in openSprints()"
                  spellCheck={false}
                  className={monoInputClass}
                />
              </Field>
            </Section>

            <Section>
              <Heading hint={t('set.projectsHint')}>{t('set.projects')}</Heading>

              {projectKeys.length === 0 && (
                <p className="text-[12.5px] text-ink-5">{t('set.noProjects')}</p>
              )}

              {projectKeys.map((key) => {
                const p = draft.projects[key]
                if (!p) return null
                return (
                  <div
                    key={key}
                    className="flex flex-col gap-2.5 rounded-lg border border-line bg-panel px-3 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <Key as="strong">{key}</Key>
                      <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-ink-4">
                        <input
                          type="checkbox"
                          checked={p.enabled}
                          onChange={(e) => {
                            const on = e.target.checked
                            patch((d) => {
                              const x = d.projects[key]
                              if (x) x.enabled = on
                            })
                          }}
                          className="size-3.5 accent-[var(--accent)]"
                        />
                        {t('set.active')}
                      </label>
                      <button
                        type="button"
                        onClick={() => patch((d) => void delete d.projects[key])}
                        className="ml-auto cursor-pointer rounded-md border border-line bg-control px-2.5 py-1 text-[11.5px] text-ink-5 hover:border-danger-line hover:bg-danger-bg hover:text-danger"
                      >
                        {t('common.remove')}
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
                      <input
                        value={p.repo}
                        onChange={(e) => {
                          const v = e.target.value
                          patch((d) => {
                            const x = d.projects[key]
                            if (x) x.repo = v
                          })
                        }}
                        placeholder={t('set.repoPlaceholder')}
                        spellCheck={false}
                        className={monoInputClass}
                      />
                      <input
                        value={p.baseBranch}
                        onChange={(e) => {
                          const v = e.target.value
                          patch((d) => {
                            const x = d.projects[key]
                            if (x) x.baseBranch = v
                          })
                        }}
                        placeholder="main"
                        spellCheck={false}
                        className={monoInputClass}
                      />
                    </div>
                  </div>
                )
              })}

              <div className="flex gap-2">
                <input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                  placeholder={t('set.projectKeyPlaceholder')}
                  spellCheck={false}
                  className={monoInputClass}
                />
                <Button
                  className="shrink-0"
                  disabled={!newKey.trim() || projectKeys.includes(newKey.trim())}
                  onClick={() => {
                    const key = newKey.trim()
                    patch(
                      (d) => void (d.projects[key] = { repo: '', baseBranch: 'main', enabled: true }),
                    )
                    setNewKey('')
                  }}
                >
                  {t('common.add')}
                </Button>
              </div>
            </Section>

            <Section>
              <Heading>{t('set.branchAndWorktree')}</Heading>

              <Field label={t('set.branchPattern')}>
                <input
                  value={draft.branch.pattern}
                  onChange={(e) => patch((d) => void (d.branch.pattern = e.target.value))}
                  spellCheck={false}
                  className={monoInputClass}
                />
              </Field>
              <Tokens items={data.branchPlaceholders} />
              {preview && (
                <p className="text-[11.5px] text-ink-5">
                  {t('set.example')} <span className="font-mono text-ink-2">{preview}</span>
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('set.slugMax')}>
                  <input
                    type="number"
                    min={1}
                    value={draft.branch.slugMaxLength}
                    onChange={(e) =>
                      patch((d) => void (d.branch.slugMaxLength = Number(e.target.value) || 1))
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label={t('set.worktreeDir')}>
                  <input
                    value={draft.worktrees.dir}
                    onChange={(e) => patch((d) => void (d.worktrees.dir = e.target.value))}
                    spellCheck={false}
                    className={monoInputClass}
                  />
                </Field>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={draft.worktrees.alignOriginHead}
                  onChange={(e) => {
                    const on = e.target.checked
                    patch((d) => void (d.worktrees.alignOriginHead = on))
                  }}
                  className="mt-0.5 size-3.5 shrink-0 accent-[var(--accent)]"
                />
                <span className="flex flex-col gap-1">
                  <span className="text-[12.5px] text-ink-2">{t('set.alignHead')}</span>
                  <span className="text-[11.5px] leading-relaxed text-ink-5">
                    {t('set.alignHeadHint')}
                  </span>
                </span>
              </label>
            </Section>

            <Section>
              <Heading hint={t('set.editorHint')}>{t('set.editor')}</Heading>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('set.editorLabel')}>
                  <input
                    value={draft.editor.label}
                    onChange={(e) => patch((d) => void (d.editor.label = e.target.value))}
                    className={inputClass}
                  />
                </Field>
                <Field label={t('set.editorCommand')}>
                  <input
                    value={draft.editor.command}
                    onChange={(e) => patch((d) => void (d.editor.command = e.target.value))}
                    spellCheck={false}
                    className={monoInputClass}
                  />
                </Field>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[11.5px] font-semibold text-ink-4">{t('set.editorArgs')}</span>
                <StringList
                  mono
                  values={draft.editor.args}
                  onChange={(next) => patch((d) => void (d.editor.args = next))}
                  placeholder="{{path}}"
                  addLabel={t('set.addArg')}
                />
                <p className="text-[11.5px] text-ink-5">
                  {t('set.editorArgsHint', { token: '{{path}}' })}
                </p>
              </div>
            </Section>

            <Section>
              <Heading hint={t('set.promptHint')}>{t('set.prompt')}</Heading>
              <Field label={t('set.promptBase')}>
                <input
                  value={draft.prompt.base}
                  onChange={(e) => patch((d) => void (d.prompt.base = e.target.value))}
                  spellCheck={false}
                  className={monoInputClass}
                />
              </Field>
              <div className="flex flex-col gap-2">
                <span className="text-[11.5px] font-semibold text-ink-4">
                  {t('set.promptAdditions')}
                </span>
                <StringList
                  values={draft.prompt.additions}
                  onChange={(next) => patch((d) => void (d.prompt.additions = next))}
                  placeholder=""
                  addLabel={t('set.addLine')}
                />
              </div>
              <Tokens items={data.placeholders} />
            </Section>

            <Section>
              <Heading>{t('set.onInit')}</Heading>
              <div className="flex flex-col gap-2">
                {(
                  [
                    ['open', 'set.launchOpen'],
                    ['clipboard', 'set.launchClipboard'],
                  ] as const
                ).map(([mode, key]) => (
                  <label key={mode} className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="radio"
                      name="launch"
                      checked={draft.launch.mode === mode}
                      onChange={() => patch((d) => void (d.launch.mode = mode))}
                      className="mt-0.5 size-3.5 shrink-0 accent-[var(--accent)]"
                    />
                    <span className="text-[12.5px] text-ink-2">{t(key)}</span>
                  </label>
                ))}
                <p className="text-[11.5px] leading-relaxed text-ink-5">{t('set.launchHint')}</p>
              </div>

              <Field label={t('set.permissionMode')} hint={t('set.permissionHint')}>
                <select
                  value={draft.launch.permissionMode}
                  onChange={(e) => {
                    const v = e.target.value as FileConfig['launch']['permissionMode']
                    patch((d) => void (d.launch.permissionMode = v))
                  }}
                  className={inputClass}
                >
                  {PERMISSION_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {t(m.key)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t('set.defaultModel')} hint={t('set.defaultModelHint')}>
                <ModelPicker
                  value={draft.launch.defaultModel}
                  onChange={(v) => patch((d) => void (d.launch.defaultModel = v))}
                  presets={MODEL_PRESETS.map((m) => ({ value: m.value, label: t(m.key) }))}
                  placeholder={t('set.modelPlaceholder')}
                />
              </Field>
            </Section>
          </>
        )}
      </div>
    </Modal>
  )
}
