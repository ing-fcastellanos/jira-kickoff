import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import dotenv from 'dotenv'
import { z } from 'zod'
import { configDir, configPath } from './paths'
import { readCredentials } from './credentials'

dotenv.config()

const promptSchema = z.object({
  base: z.string().min(1),
  additions: z.array(z.string()).default([]),
})

/** Un proyecto puede sobrescribir cualquier parte del prompt global. */
const projectSchema = z.object({
  repo: z.string().min(1),
  baseBranch: z.string().min(1),
  /** Desactivado se conserva en el archivo pero queda fuera de la consulta. */
  enabled: z.boolean().default(true),
  prompt: promptSchema.partial().optional(),
})

const configSchema = z.object({
  server: z.object({ port: z.number().int().positive() }).default({ port: 8787 }),
  jira: z.object({
    site: z.string().url().or(z.literal('')),
    statuses: z.array(z.string().min(1)),
    /** Se concatena a la JQL generada. Util para acotar a un sprint o a un epic. */
    extraJql: z.string().default(''),
  }),
  worktrees: z.object({
    dir: z.string().min(1),
    /**
     * Claude Code deduce la rama principal de un repo con
     * `git symbolic-ref refs/remotes/origin/HEAD`, no de la rama base que use
     * este panel. Si el remoto declara `main` pero aqui se trabaja sobre otra,
     * la sesion mostrara la equivocada. Es un cambio local, nunca se sube.
     */
    alignOriginHead: z.boolean().default(false),
  }),
  branch: z.object({
    pattern: z.string().min(1),
    slugMaxLength: z.number().int().positive(),
  }),
  launch: z
    .object({
      mode: z.enum(['open', 'clipboard']),
      /**
       * El deep link solo transporta el prompt y la carpeta: no hay forma de
       * pedirle un modo de permisos. Se escribe en el
       * `.claude/settings.local.json` del worktree, que es tier `local`.
       *
       * Tiene que ser el tier local y no el `settings.json` versionado del repo:
       * los modos elevados que vienen del tier `project` la app los descarta en
       * silencio, para que un repositorio no pueda auto-concederse permisos.
       */
      permissionMode: z
        .enum(['inherit', 'default', 'plan', 'acceptEdits', 'auto', 'bypassPermissions'])
        .default('inherit'),
    })
    .default({ mode: 'open', permissionMode: 'inherit' }),
  editor: z
    .object({
      label: z.string().min(1),
      command: z.string().min(1),
      /** `{{path}}` se sustituye por la ruta del worktree. */
      args: z.array(z.string()),
    })
    .default({ label: 'VS Code', command: 'code', args: ['-n', '{{path}}'] }),
  prompt: promptSchema,
  projects: z.record(z.string(), projectSchema),
})

export type FileConfig = z.infer<typeof configSchema>
export type ProjectConfig = z.infer<typeof projectSchema>
export type PromptConfig = z.infer<typeof promptSchema>

export interface AppConfig extends FileConfig {
  /** Puerto efectivo: PORT del entorno gana sobre config.json. */
  port: number
  jiraEmail: string | null
  jiraToken: string | null
  /** Hay sitio de Jira y al menos un proyecto: la app puede trabajar. */
  configured: boolean
}

export class ConfigError extends Error {}

/** Punto de partida de una instalacion nueva, antes del asistente. */
export const DEFAULT_CONFIG: FileConfig = {
  server: { port: 8787 },
  jira: { site: '', statuses: ['To Do', 'In Progress'], extraJql: '' },
  worktrees: { dir: '.worktrees', alignOriginHead: false },
  branch: { pattern: 'feature/{{ticket-lower}}-{{slug}}', slugMaxLength: 40 },
  launch: { mode: 'open', permissionMode: 'inherit' },
  editor: { label: 'VS Code', command: 'code', args: ['-n', '{{path}}'] },
  prompt: {
    base: 'Vamos a trabajar el ticket {{ticket}}.',
    additions: ['Revisa los comentarios del ticket antes de proponer nada.', 'El ticket esta en {{url}}.'],
  },
  projects: {},
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => `  · ${i.path.join('.') || '(raiz)'}: ${i.message}`).join('\n')
}

export function parseConfig(raw: unknown): FileConfig {
  const parsed = configSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ConfigError(`La configuracion tiene errores:\n${describeIssues(parsed.error)}`)
  }
  return parsed.data
}

function toAppConfig(file: FileConfig): AppConfig {
  const envPort = process.env.PORT ? Number(process.env.PORT) : null
  if (envPort !== null && !Number.isInteger(envPort)) {
    throw new ConfigError(`PORT="${process.env.PORT}" no es un entero.`)
  }

  const creds = readCredentials()
  return {
    ...file,
    port: envPort ?? file.server.port,
    jiraEmail: creds?.jiraEmail ?? null,
    jiraToken: creds?.jiraToken ?? null,
    configured: Boolean(file.jira.site) && Object.keys(file.projects).length > 0,
  }
}

/**
 * Traslada una configuracion que viviera junto al codigo, de cuando esto se
 * clonaba en vez de ejecutarse con `npx`. Se hace una sola vez y sin borrar el
 * original, para no dejar a nadie sin su configuracion tras actualizar.
 */
function migrateLegacy(rootDir: string): void {
  const target = configPath()
  if (existsSync(target)) return

  // Dos origenes posibles: junto al codigo, de cuando esto se clonaba en vez de
  // ejecutarse con `npx`, y la carpeta del nombre anterior del paquete. Se copia
  // sin borrar el original, para no dejar a nadie sin su configuracion.
  const candidates = [
    resolve(rootDir, 'config.json'),
    resolve(dirname(configDir()), 'jira-ticket-workflow', 'config.json'),
  ]

  for (const legacy of candidates) {
    if (!existsSync(legacy)) continue
    mkdirSync(configDir(), { recursive: true })
    copyFileSync(legacy, target)

    const legacyCreds = resolve(dirname(legacy), 'credentials.json')
    const targetCreds = resolve(dirname(target), 'credentials.json')
    if (existsSync(legacyCreds) && !existsSync(targetCreds)) {
      copyFileSync(legacyCreds, targetCreds)
    }
    return
  }
}

/**
 * Nunca falla por ausencia de configuracion: una instalacion nueva arranca con
 * los valores por defecto y el asistente se encarga del resto. Solo se queja si
 * el archivo existe y esta roto, que si es un problema que hay que ver.
 */
export function loadConfig(rootDir: string): AppConfig {
  migrateLegacy(rootDir)

  const path = configPath()
  if (!existsSync(path)) return toAppConfig(DEFAULT_CONFIG)

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new ConfigError(`${path} no es JSON valido: ${(err as Error).message}`)
  }

  return toAppConfig(parseConfig(raw))
}

/**
 * Fusiona el prompt global con el override del proyecto.
 * Un proyecto que define `additions` reemplaza la lista completa, no la extiende:
 * mezclarlas haria imposible quitar una adicion global desde un proyecto.
 */
export function resolvePrompt(config: AppConfig, projectKey: string): PromptConfig {
  const override = config.projects[projectKey]?.prompt
  return {
    base: override?.base ?? config.prompt.base,
    additions: override?.additions ?? config.prompt.additions,
  }
}

/** Claves de los proyectos activos, que son los que entran en la consulta a Jira. */
export function enabledProjectKeys(config: AppConfig): string[] {
  return Object.entries(config.projects)
    .filter(([, p]) => p.enabled)
    .map(([key]) => key)
}

/**
 * Guarda la configuracion y notifica a quien dependa de ella.
 *
 * config.json dejo de ser un archivo que solo se lee al arrancar: la pantalla de
 * opciones lo escribe. Por eso la escritura es atomica (temporal + rename) — una
 * escritura interrumpida dejaria la herramienta sin poder arrancar.
 */
export class ConfigStore {
  private listeners = new Set<() => void>()

  private constructor(private current: AppConfig) {}

  static load(rootDir: string): ConfigStore {
    return new ConfigStore(loadConfig(rootDir))
  }

  get(): AppConfig {
    return this.current
  }

  subscribe(listener: () => void): void {
    this.listeners.add(listener)
  }

  /** Relee credenciales sin tocar el archivo de configuracion. */
  reloadCredentials(): AppConfig {
    const { port: _p, jiraEmail: _e, jiraToken: _t, configured: _c, ...file } = this.current
    this.current = toAppConfig(file)
    this.notify()
    return this.current
  }

  save(raw: unknown): AppConfig {
    const validated = parseConfig(raw)

    mkdirSync(configDir(), { recursive: true })
    const path = configPath()
    const tmp = `${path}.tmp`
    writeFileSync(tmp, `${JSON.stringify(validated, null, 2)}\n`, 'utf8')
    renameSync(tmp, path)

    this.current = toAppConfig(validated)
    this.notify()
    return this.current
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
