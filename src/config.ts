import { readFileSync, existsSync, writeFileSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
import dotenv from 'dotenv'
import { z } from 'zod'

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
    site: z.string().url(),
    statuses: z.array(z.string().min(1)).min(1),
    /** Se concatena a la JQL generada. Util para acotar a un sprint o a un epic. */
    extraJql: z.string().default(''),
  }),
  worktrees: z.object({
    dir: z.string().min(1),
    /**
     * Claude Code deduce la rama principal de un repo con
     * `git symbolic-ref refs/remotes/origin/HEAD`, no de la rama base que use
     * este panel. Si el remoto declara `main` pero aqui se trabaja sobre otra,
     * la sesion mostrara la equivocada. Con esto se apunta `origin/HEAD` a la
     * rama base al inicializar. Es un cambio local del repo, nunca se sube.
     */
    alignOriginHead: z.boolean().default(false),
  }),
  branch: z.object({
    pattern: z.string().min(1),
    slugMaxLength: z.number().int().positive(),
  }),
  launch: z
    .object({
      /**
       * `open` entrega el deep link al sistema. `clipboard` se queda en crear el
       * worktree y deja que la UI ofrezca el prompt para pegarlo a mano, que es
       * la salida cuando el deep link deja de funcionar.
       */
      mode: z.enum(['open', 'clipboard']),
      /**
       * El deep link solo transporta el prompt y la carpeta: no hay forma de
       * pedirle un modo de permisos. Se escribe en `.claude/settings.local.json`
       * del worktree, que es tier `local`.
       *
       * Tiene que ser el tier local y no el `settings.json` versionado del repo:
       * los modos elevados que vienen del tier `project` la app los descarta en
       * silencio, para que un repositorio no pueda auto-concederse permisos.
       *
       * `inherit` no escribe nada y deja que decidan tus settings de usuario.
       */
      permissionMode: z
        .enum(['inherit', 'default', 'plan', 'acceptEdits', 'auto', 'bypassPermissions'])
        .default('inherit'),
    })
    .default({ mode: 'open', permissionMode: 'inherit' }),
  editor: z
    .object({
      /** Nombre que se muestra en el boton. */
      label: z.string().min(1),
      command: z.string().min(1),
      /** `{{path}}` se sustituye por la ruta del worktree. */
      args: z.array(z.string()),
    })
    .default({ label: 'VS Code', command: 'code', args: ['-n', '{{path}}'] }),
  prompt: promptSchema,
  projects: z
    .record(z.string(), projectSchema)
    .refine((p) => Object.keys(p).length > 0, 'Define al menos un proyecto.'),
})

export type FileConfig = z.infer<typeof configSchema>
export type ProjectConfig = z.infer<typeof projectSchema>
export type PromptConfig = z.infer<typeof promptSchema>

export interface AppConfig extends FileConfig {
  /** Puerto efectivo: PORT del entorno gana sobre config.json. */
  port: number
  jiraEmail: string | null
  jiraToken: string | null
}

export class ConfigError extends Error {}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => `  · ${i.path.join('.') || '(raiz)'}: ${i.message}`).join('\n')
}

function toAppConfig(file: FileConfig): AppConfig {
  const envPort = process.env.PORT ? Number(process.env.PORT) : null
  if (envPort !== null && !Number.isInteger(envPort)) {
    throw new ConfigError(`PORT="${process.env.PORT}" no es un entero.`)
  }
  return {
    ...file,
    port: envPort ?? file.server.port,
    jiraEmail: process.env.JIRA_EMAIL?.trim() || null,
    jiraToken: process.env.JIRA_API_TOKEN?.trim() || null,
  }
}

export function parseConfig(raw: unknown): FileConfig {
  const parsed = configSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ConfigError(`La configuracion tiene errores:\n${describeIssues(parsed.error)}`)
  }
  return parsed.data
}

export function loadConfig(rootDir: string): AppConfig {
  const path = resolve(rootDir, 'config.json')

  if (!existsSync(path)) {
    throw new ConfigError(
      `No encuentro config.json en ${path}.\n` +
        `Copia config.example.json a config.json y ajusta las rutas de tus repos.`,
    )
  }

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new ConfigError(`config.json no es JSON valido: ${(err as Error).message}`)
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

  private constructor(
    private readonly rootDir: string,
    private current: AppConfig,
  ) {}

  static load(rootDir: string): ConfigStore {
    return new ConfigStore(rootDir, loadConfig(rootDir))
  }

  get(): AppConfig {
    return this.current
  }

  subscribe(listener: () => void): void {
    this.listeners.add(listener)
  }

  save(raw: unknown): AppConfig {
    const validated = parseConfig(raw)

    const path = resolve(this.rootDir, 'config.json')
    const tmp = `${path}.tmp`
    writeFileSync(tmp, `${JSON.stringify(validated, null, 2)}\n`, 'utf8')
    renameSync(tmp, path)

    this.current = toAppConfig(validated)
    for (const listener of this.listeners) listener()
    return this.current
  }
}
