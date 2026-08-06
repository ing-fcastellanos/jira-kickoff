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

/** A project can override any part of the global prompt. */
const projectSchema = z.object({
  repo: z.string().min(1),
  baseBranch: z.string().min(1),
  /** Disabled is kept in the file but left out of the query. */
  enabled: z.boolean().default(true),
  prompt: promptSchema.partial().optional(),
})

const configSchema = z.object({
  server: z.object({ port: z.number().int().positive() }).default({ port: 8787 }),
  jira: z.object({
    site: z.string().url().or(z.literal('')),
    statuses: z.array(z.string().min(1)),
    /** Appended to the generated JQL. Useful to narrow to a sprint or an epic. */
    extraJql: z.string().default(''),
  }),
  worktrees: z.object({
    dir: z.string().min(1),
    /**
     * Claude Code works out a repo's main branch with
     * `git symbolic-ref refs/remotes/origin/HEAD`, not from the base branch this
     * panel uses. If the remote declares `main` but the work here happens on
     * another one, the session shows the wrong branch. Local change, never pushed.
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
       * The deep link only carries the prompt and the folder: there is no way to
       * ask it for a permission mode. It is written into the worktree's
       * `.claude/settings.local.json`, which is the `local` tier.
       *
       * It has to be the local tier and not the repo's versioned `settings.json`:
       * elevated modes coming from the `project` tier are silently discarded by
       * the app, so that a repository cannot grant itself permissions.
       */
      permissionMode: z
        .enum(['inherit', 'default', 'plan', 'acceptEdits', 'auto', 'bypassPermissions'])
        .default('inherit'),
      /**
       * Model alias ("opus", "sonnet", "haiku") or full model id for sessions
       * started from a worktree. Empty means inherit, same idea as
       * permissionMode: nothing is written and the app picks its own default.
       *
       * Written to the same `.claude/settings.local.json` as permissionMode, for
       * the same reason the deep link cannot carry it. Free string and not an
       * enum on purpose: model ids and aliases change over releases, and pinning
       * them here would mean a code change every time one does.
       */
      defaultModel: z.string().trim().default(''),
    })
    .default({ mode: 'open', permissionMode: 'inherit', defaultModel: '' }),
  editor: z
    .object({
      label: z.string().min(1),
      command: z.string().min(1),
      /** `{{path}}` is replaced by the worktree path. */
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
  /** Effective port: PORT from the environment wins over config.json. */
  port: number
  jiraEmail: string | null
  jiraToken: string | null
  /** There is a Jira site and at least one project: the app can work. */
  configured: boolean
}

export class ConfigError extends Error {}

/** Starting point for a fresh install, before the wizard. */
export const DEFAULT_CONFIG: FileConfig = {
  server: { port: 8787 },
  jira: { site: '', statuses: ['To Do', 'In Progress'], extraJql: '' },
  worktrees: { dir: '.worktrees', alignOriginHead: false },
  branch: { pattern: 'feature/{{ticket-lower}}-{{slug}}', slugMaxLength: 40 },
  launch: { mode: 'open', permissionMode: 'inherit', defaultModel: '' },
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
 * Moves over a configuration that used to live next to the code, from when this
 * was cloned instead of run with `npx`. Done once and without deleting the
 * original, so that nobody is left without their configuration after updating.
 */
function migrateLegacy(rootDir: string): void {
  const target = configPath()
  if (existsSync(target)) return

  // Two possible sources: next to the code, from when this was cloned instead of
  // run with `npx`, and the folder of the package's previous name. It is copied
  // without deleting the original, so that nobody is left without their config.
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
 * Never fails for a missing configuration: a fresh install starts with the
 * defaults and the wizard takes care of the rest. It only complains if the file
 * exists and is broken, which is a problem that does need to be seen.
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
 * Merges the global prompt with the project override.
 * A project that defines `additions` replaces the whole list, it does not extend
 * it: merging them would make it impossible to remove a global addition from a
 * project.
 */
export function resolvePrompt(config: AppConfig, projectKey: string): PromptConfig {
  const override = config.projects[projectKey]?.prompt
  return {
    base: override?.base ?? config.prompt.base,
    additions: override?.additions ?? config.prompt.additions,
  }
}

/** Keys of the enabled projects, which are the ones that go into the Jira query. */
export function enabledProjectKeys(config: AppConfig): string[] {
  return Object.entries(config.projects)
    .filter(([, p]) => p.enabled)
    .map(([key]) => key)
}

/**
 * Saves the configuration and notifies whoever depends on it.
 *
 * config.json stopped being a file that is only read at startup: the options
 * screen writes to it. That is why the write is atomic (temp file + rename) — an
 * interrupted write would leave the tool unable to start.
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

  /** Re-reads credentials without touching the configuration file. */
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
