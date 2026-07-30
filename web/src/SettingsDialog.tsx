import { useCallback, useEffect, useState } from 'react'
import type { FileConfig, Placeholder, SettingsResponse } from './types'
import { getJson, postJson, putJson } from './api'
import { applyTheme, readTheme, type Theme } from './theme'

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: SettingsResponse }

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Según el sistema' },
]

const inputClass =
  'w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900'

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-zinc-100 py-5 first:pt-0 last:border-b-0 dark:border-zinc-800">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="mt-0.5 mb-3 text-xs text-zinc-500">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </span>
      {children}
    </label>
  )
}

function Placeholders({ items }: { items: Placeholder[] }) {
  return (
    <p className="mt-2 text-xs text-zinc-500">
      Disponibles:{' '}
      {items.map((p, i) => (
        <span key={p.token}>
          {i > 0 && ', '}
          <code className="font-mono text-zinc-600 dark:text-zinc-400" title={p.description}>
            {p.token}
          </code>
        </span>
      ))}
    </p>
  )
}

/** Lista de cadenas editable: statuses de Jira y líneas del prompt. */
function StringList({
  values,
  onChange,
  placeholder,
  addLabel,
}: {
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
  addLabel: string
}) {
  return (
    <div className="space-y-2">
      {values.map((value, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            aria-label="Quitar"
            className="shrink-0 rounded-md border border-zinc-300 px-2 text-sm text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...values, ''])}
        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {addLabel}
      </button>
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
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [draft, setDraft] = useState<FileConfig | null>(null)
  const [theme, setTheme] = useState<Theme>(() => readTheme())
  const [newKey, setNewKey] = useState('')
  const [preview, setPreview] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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

  // Vista previa del nombre de rama: la calcula el servidor, que es donde vive
  // la normalizacion del slug. Con espera, para no llamar en cada tecla.
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Opciones"
        className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold">Opciones</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Se guardan en <code className="font-mono">config.json</code>, salvo el tema.
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

        <div className="px-5">
          {load.status === 'loading' && (
            <p className="py-6 text-sm text-zinc-500">Cargando configuración…</p>
          )}

          {load.status === 'error' && (
            <div className="my-5 rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
              <p className="text-sm text-red-700 dark:text-red-400">{load.message}</p>
            </div>
          )}

          {draft && data && (
            <>
              <Section title="Apariencia" hint="Se guarda en este navegador, no en config.json.">
                <div className="flex gap-2">
                  {THEMES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => {
                        setTheme(t.value)
                        applyTheme(t.value)
                      }}
                      className={`rounded-md border px-3 py-1.5 text-sm ${
                        theme === t.value
                          ? 'border-sky-500 bg-sky-50 font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                          : 'border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </Section>

              <Section
                title="Jira"
                hint={
                  data.credentials.configured
                    ? `Conectado como ${data.credentials.email}. El token vive en .env y no se edita aquí.`
                    : 'Faltan JIRA_EMAIL y JIRA_API_TOKEN en .env.'
                }
              >
                <div className="space-y-3">
                  <Field label="Sitio">
                    <input
                      value={draft.jira.site}
                      onChange={(e) => patch((d) => void (d.jira.site = e.target.value))}
                      placeholder="https://tu-dominio.atlassian.net"
                      spellCheck={false}
                      className={inputClass}
                    />
                  </Field>

                  <div>
                    <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Status a incluir
                    </span>
                    <StringList
                      values={draft.jira.statuses}
                      onChange={(next) => patch((d) => void (d.jira.statuses = next))}
                      placeholder="In Progress"
                      addLabel="Añadir status"
                    />
                    <p className="mt-2 text-xs text-zinc-500">
                      Los nombres exactos de tu Jira. Se enumeran uno a uno a propósito: filtrar
                      por categoría mezcla status que significan cosas distintas.
                    </p>
                  </div>

                  <Field label="Filtro JQL adicional (opcional)">
                    <input
                      value={draft.jira.extraJql}
                      onChange={(e) => patch((d) => void (d.jira.extraJql = e.target.value))}
                      placeholder="sprint in openSprints()"
                      spellCheck={false}
                      className={`${inputClass} font-mono`}
                    />
                  </Field>
                </div>
              </Section>

              <Section
                title="Proyectos"
                hint="Cada clave de Jira apuntando al repositorio local donde se creará el worktree."
              >
                <div className="space-y-3">
                  {projectKeys.length === 0 && (
                    <p className="text-sm text-zinc-500">Todavía no hay ninguno.</p>
                  )}

                  {projectKeys.map((key) => {
                    const p = draft.projects[key]
                    if (!p) return null
                    return (
                      <div
                        key={key}
                        className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{key}</span>
                          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                            <input
                              type="checkbox"
                              checked={p.enabled}
                              onChange={(e) => {
                                const on = e.target.checked
                                patch((d) => {
                                  const t = d.projects[key]
                                  if (t) t.enabled = on
                                })
                              }}
                            />
                            Activo
                          </label>
                          <button
                            type="button"
                            onClick={() => patch((d) => void delete d.projects[key])}
                            className="ml-auto rounded-md border border-zinc-300 px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                          >
                            Quitar
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
                          <input
                            value={p.repo}
                            onChange={(e) => {
                              const v = e.target.value
                              patch((d) => {
                                const t = d.projects[key]
                                if (t) t.repo = v
                              })
                            }}
                            placeholder="/ruta/al/repositorio"
                            spellCheck={false}
                            className={`${inputClass} font-mono text-xs`}
                          />
                          <input
                            value={p.baseBranch}
                            onChange={(e) => {
                              const v = e.target.value
                              patch((d) => {
                                const t = d.projects[key]
                                if (t) t.baseBranch = v
                              })
                            }}
                            placeholder="main"
                            spellCheck={false}
                            className={`${inputClass} font-mono text-xs`}
                          />
                        </div>
                      </div>
                    )
                  })}

                  <div className="flex gap-2">
                    <input
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                      placeholder="Clave del proyecto, p. ej. ABC"
                      spellCheck={false}
                      className={`${inputClass} font-mono`}
                    />
                    <button
                      type="button"
                      disabled={!newKey.trim() || projectKeys.includes(newKey.trim())}
                      onClick={() => {
                        const key = newKey.trim()
                        patch(
                          (d) =>
                            void (d.projects[key] = { repo: '', baseBranch: 'main', enabled: true }),
                        )
                        setNewKey('')
                      }}
                      className="shrink-0 rounded-md border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      Añadir
                    </button>
                  </div>
                </div>
              </Section>

              <Section title="Rama y worktree">
                <div className="space-y-3">
                  <Field label="Patrón del nombre de rama">
                    <input
                      value={draft.branch.pattern}
                      onChange={(e) => patch((d) => void (d.branch.pattern = e.target.value))}
                      spellCheck={false}
                      className={`${inputClass} font-mono`}
                    />
                  </Field>
                  <Placeholders items={data.branchPlaceholders} />
                  {preview && (
                    <p className="text-xs text-zinc-500">
                      Ejemplo: <code className="font-mono text-zinc-700 dark:text-zinc-300">{preview}</code>
                    </p>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Largo máximo del slug">
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
                    <Field label="Carpeta de worktrees (dentro del repo)">
                      <input
                        value={draft.worktrees.dir}
                        onChange={(e) => patch((d) => void (d.worktrees.dir = e.target.value))}
                        spellCheck={false}
                        className={`${inputClass} font-mono text-xs`}
                      />
                    </Field>
                  </div>

                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.worktrees.alignOriginHead}
                      onChange={(e) => {
                        const on = e.target.checked
                        patch((d) => void (d.worktrees.alignOriginHead = on))
                      }}
                      className="mt-1"
                    />
                    <span>
                      Apuntar <code className="font-mono text-xs">origin/HEAD</code> a la rama base
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        Claude Code deduce la rama principal del repo de esa referencia, no de la
                        rama base configurada aquí. Si el remoto declara otra, la sesión mostrará
                        la equivocada. Es un cambio local del clon; nunca se sube.
                      </span>
                    </span>
                  </label>
                </div>
              </Section>

              <Section
                title="Prompt inicial"
                hint="La base y las líneas fijas. Antes de enviar siempre puedes editarlo."
              >
                <div className="space-y-3">
                  <Field label="Comando base">
                    <input
                      value={draft.prompt.base}
                      onChange={(e) => patch((d) => void (d.prompt.base = e.target.value))}
                      spellCheck={false}
                      className={`${inputClass} font-mono`}
                    />
                  </Field>

                  <div>
                    <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Líneas añadidas
                    </span>
                    <StringList
                      values={draft.prompt.additions}
                      onChange={(next) => patch((d) => void (d.prompt.additions = next))}
                      placeholder="Revisa los comentarios del ticket antes de proponer nada."
                      addLabel="Añadir línea"
                    />
                  </div>

                  <Placeholders items={data.placeholders} />
                </div>
              </Section>

              <Section
                title="Editor"
                hint="El botón «Abrir en …» de la lista de worktrees. Debe estar en el PATH."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nombre en el botón">
                    <input
                      value={draft.editor.label}
                      onChange={(e) => patch((d) => void (d.editor.label = e.target.value))}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Comando">
                    <input
                      value={draft.editor.command}
                      onChange={(e) => patch((d) => void (d.editor.command = e.target.value))}
                      spellCheck={false}
                      className={`${inputClass} font-mono`}
                    />
                  </Field>
                </div>
                <div className="mt-3">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Argumentos
                  </span>
                  <StringList
                    values={draft.editor.args}
                    onChange={(next) => patch((d) => void (d.editor.args = next))}
                    placeholder="{{path}}"
                    addLabel="Añadir argumento"
                  />
                  <p className="mt-2 text-xs text-zinc-500">
                    <code className="font-mono">{'{{path}}'}</code> se sustituye por la ruta del
                    worktree. Por defecto <code className="font-mono">code -n {'{{path}}'}</code>,
                    que abre una ventana nueva.
                  </p>
                </div>
              </Section>

              <Section title="Al inicializar">
                <div className="space-y-2">
                  {(
                    [
                      ['open', 'Crear el worktree y abrir la sesión'],
                      ['clipboard', 'Solo crear el worktree y copiar el prompt'],
                    ] as const
                  ).map(([mode, label]) => (
                    <label key={mode} className="flex items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name="launch"
                        checked={draft.launch.mode === mode}
                        onChange={() => patch((d) => void (d.launch.mode = mode))}
                        className="mt-1"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                  <p className="text-xs text-zinc-500">
                    El deep link es interfaz interna de la app y puede romperse en una
                    actualización. La segunda opción es la salida cuando eso pase.
                  </p>

                  <div className="pt-2">
                    <Field label="Modo de permisos de la sesión">
                      <select
                        value={draft.launch.permissionMode}
                        onChange={(e) => {
                          const v = e.target.value as FileConfig['launch']['permissionMode']
                          patch((d) => void (d.launch.permissionMode = v))
                        }}
                        className={inputClass}
                      >
                        <option value="inherit">Heredar de mis settings</option>
                        <option value="default">Preguntar (default)</option>
                        <option value="plan">Plan</option>
                        <option value="acceptEdits">Aceptar ediciones</option>
                        <option value="auto">Auto</option>
                        <option value="bypassPermissions">Saltar permisos</option>
                      </select>
                    </Field>
                    <p className="mt-1 text-xs text-zinc-500">
                      El deep link no puede pedir un modo, así que se escribe en el
                      <code className="mx-1 font-mono">.claude/settings.local.json</code>
                      del worktree. Tiene que ser ese archivo y no el del repo: los modos
                      elevados que vienen del tier de proyecto la app los descarta en silencio.
                    </p>
                  </div>
                </div>
              </Section>
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
          {saveError && (
            <p className="mr-auto text-xs whitespace-pre-line text-red-600 dark:text-red-400">
              {saveError}
            </p>
          )}
          {saved && !saveError && (
            <p className="mr-auto text-xs text-emerald-600 dark:text-emerald-400">Guardado ✓</p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!draft || saving}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-800"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </footer>
      </div>
    </div>
  )
}
