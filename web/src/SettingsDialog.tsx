import { useCallback, useEffect, useState } from 'react'
import type { FileConfig, Placeholder, SettingsResponse } from './types'
import { getJson, postJson, putJson } from './api'
import { applyTheme, readTheme, type Theme } from './theme'
import { Button, Field, Heading, Key, Modal, Note, inputClass, monoInputClass } from './ui'

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: SettingsResponse }

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Según el sistema' },
]

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-line-soft py-4 last:border-b-0">
      {children}
    </section>
  )
}

function Tokens({ items }: { items: Placeholder[] }) {
  return (
    <p className="text-[11.5px] text-ink-5">
      Disponibles:{' '}
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

/** Lista de cadenas editable: statuses de Jira, lineas del prompt, argumentos. */
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
            aria-label="Quitar"
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
    <Modal
      label="Opciones"
      maxWidth="max-w-[700px]"
      onClose={onClose}
      title={
        <Heading
          level={2}
          hint={
            <>
              Se guardan en <span className="font-mono text-ok">`config.json`</span>, salvo el tema.
            </>
          }
        >
          Opciones
        </Heading>
      }
      footer={
        <>
          {saveError && (
            <p className="mr-auto text-[11.5px] whitespace-pre-line text-danger">{saveError}</p>
          )}
          {saved && !saveError && <p className="mr-auto text-[11.5px] text-ok">Guardado ✓</p>}
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!draft || saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="max-h-[72vh] overflow-y-auto px-4.5">
        {load.status === 'loading' && (
          <p className="py-4 text-[12.5px] text-ink-5">Cargando configuración…</p>
        )}

        {load.status === 'error' && (
          <div className="py-4">
            <Note tone="danger">{load.message}</Note>
          </div>
        )}

        {draft && data && (
          <>
            <Section>
              <Heading hint="Se guarda en este navegador, no en config.json.">Apariencia</Heading>
              <div className="flex flex-wrap gap-2">
                {THEMES.map((t) => (
                  <Button
                    key={t.value}
                    variant={theme === t.value ? 'selected' : 'default'}
                    onClick={() => {
                      setTheme(t.value)
                      applyTheme(t.value)
                    }}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </Section>

            <Section>
              <Heading
                hint={
                  data.credentials.configured ? (
                    <>
                      Conectado como{' '}
                      <span className="font-mono text-ok">{data.credentials.email}</span>. El token
                      vive en <span className="font-mono">.env</span> y no se edita aquí.
                    </>
                  ) : (
                    'Faltan JIRA_EMAIL y JIRA_API_TOKEN en .env.'
                  )
                }
              >
                Jira
              </Heading>

              <Field label="Sitio">
                <input
                  value={draft.jira.site}
                  onChange={(e) => patch((d) => void (d.jira.site = e.target.value))}
                  placeholder="https://tu-dominio.atlassian.net"
                  spellCheck={false}
                  className={inputClass}
                />
              </Field>

              <div className="flex flex-col gap-2">
                <span className="text-[11.5px] font-semibold text-ink-4">Status a incluir</span>
                <StringList
                  values={draft.jira.statuses}
                  onChange={(next) => patch((d) => void (d.jira.statuses = next))}
                  placeholder="In Progress"
                  addLabel="Añadir status"
                />
                <p className="text-[11.5px] leading-relaxed text-pretty text-ink-5">
                  Los nombres exactos de tu Jira. Se enumeran uno a uno a propósito: filtrar por
                  categoría mezcla status que significan cosas distintas.
                </p>
              </div>

              <Field label="Filtro JQL adicional (opcional)">
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
              <Heading hint="Cada clave de Jira apuntando al repositorio local donde se creará el worktree.">
                Proyectos
              </Heading>

              {projectKeys.length === 0 && (
                <p className="text-[12.5px] text-ink-5">Todavía no hay ninguno.</p>
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
                              const t = d.projects[key]
                              if (t) t.enabled = on
                            })
                          }}
                          className="size-3.5 accent-[var(--accent)]"
                        />
                        Activo
                      </label>
                      <button
                        type="button"
                        onClick={() => patch((d) => void delete d.projects[key])}
                        className="ml-auto cursor-pointer rounded-md border border-line bg-control px-2.5 py-1 text-[11.5px] text-ink-5 hover:border-danger-line hover:bg-danger-bg hover:text-danger"
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
                        className={monoInputClass}
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
                  placeholder="Clave del proyecto, p. ej. ABC"
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
                  Añadir
                </Button>
              </div>
            </Section>

            <Section>
              <Heading>Rama y worktree</Heading>

              <Field label="Patrón del nombre de rama">
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
                  Ejemplo: <span className="font-mono text-ink-2">{preview}</span>
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
                  <span className="text-[12.5px] text-ink-2">
                    Apuntar <span className="font-mono text-[11.5px] text-ok">origin/HEAD</span> a la
                    rama base
                  </span>
                  <span className="text-[11.5px] leading-relaxed text-ink-5">
                    Claude Code deduce la rama principal de esa referencia, no de la rama base
                    configurada aquí. Es un cambio local del clon; nunca se sube.
                  </span>
                </span>
              </label>
            </Section>

            <Section>
              <Heading hint="El botón «Abrir en …» de la lista de worktrees. Debe estar en el PATH.">
                Editor
              </Heading>
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
                    className={monoInputClass}
                  />
                </Field>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[11.5px] font-semibold text-ink-4">Argumentos</span>
                <StringList
                  mono
                  values={draft.editor.args}
                  onChange={(next) => patch((d) => void (d.editor.args = next))}
                  placeholder="{{path}}"
                  addLabel="Añadir argumento"
                />
                <p className="text-[11.5px] text-ink-5">
                  <span className="font-mono text-ok">{'{{path}}'}</span> se sustituye por la ruta
                  del worktree.
                </p>
              </div>
            </Section>

            <Section>
              <Heading hint="La base y las líneas fijas. Antes de enviar siempre puedes editarlo.">
                Prompt inicial
              </Heading>
              <Field label="Comando base">
                <input
                  value={draft.prompt.base}
                  onChange={(e) => patch((d) => void (d.prompt.base = e.target.value))}
                  spellCheck={false}
                  className={monoInputClass}
                />
              </Field>
              <div className="flex flex-col gap-2">
                <span className="text-[11.5px] font-semibold text-ink-4">Líneas añadidas</span>
                <StringList
                  values={draft.prompt.additions}
                  onChange={(next) => patch((d) => void (d.prompt.additions = next))}
                  placeholder="Revisa los comentarios del ticket antes de proponer nada."
                  addLabel="Añadir línea"
                />
              </div>
              <Tokens items={data.placeholders} />
            </Section>

            <Section>
              <Heading>Al inicializar</Heading>
              <div className="flex flex-col gap-2">
                {(
                  [
                    ['open', 'Crear el worktree y abrir la sesión'],
                    ['clipboard', 'Solo crear el worktree y copiar el prompt'],
                  ] as const
                ).map(([mode, label]) => (
                  <label key={mode} className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="radio"
                      name="launch"
                      checked={draft.launch.mode === mode}
                      onChange={() => patch((d) => void (d.launch.mode = mode))}
                      className="mt-0.5 size-3.5 shrink-0 accent-[var(--accent)]"
                    />
                    <span className="text-[12.5px] text-ink-2">{label}</span>
                  </label>
                ))}
                <p className="text-[11.5px] leading-relaxed text-ink-5">
                  El deep link es interfaz interna de la app y puede romperse en una actualización.
                  La segunda opción es la salida cuando eso pase.
                </p>
              </div>

              <Field
                label="Modo de permisos de la sesión"
                hint={
                  <>
                    Se escribe en el{' '}
                    <span className="font-mono">.claude/settings.local.json</span> del worktree.
                    Tiene que ser ese archivo y no el del repo: los modos elevados que vienen del
                    tier de proyecto la app los descarta en silencio.
                  </>
                }
              >
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
            </Section>
          </>
        )}
      </div>
    </Modal>
  )
}
