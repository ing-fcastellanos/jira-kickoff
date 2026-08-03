import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { GitError } from './git'
import { LocalizedError } from './messages'
import type { BranchAction } from './types'

const run = promisify(execFile)

const QUICK_MS = 10_000
/** `fetch` sale a la red y un repo con anos de historia tarda mas de lo que parece. */
const FETCH_MS = 90_000
const ADD_MS = 120_000

async function git(repo: string, args: string[], timeout: number): Promise<string> {
  try {
    const { stdout } = await run('git', ['-C', repo, ...args], {
      timeout,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    })
    return stdout
  } catch (err) {
    const e = err as { stderr?: string; message: string; killed?: boolean }
    if (e.killed) {
      throw new LocalizedError('err.gitTimeout', {
        command: args[0] ?? 'git',
        seconds: timeout / 1000,
      })
    }
    throw new GitError(e.stderr?.trim() || e.message)
  }
}

export interface WorktreeEntry {
  path: string
  branch: string | null
}

/** Normaliza separadores: git responde con `/` incluso en Windows. */
function samePath(a: string, b: string): boolean {
  const norm = (p: string) => resolve(p).replace(/\\/g, '/').toLowerCase()
  return norm(a) === norm(b)
}

export async function listWorktrees(repo: string): Promise<WorktreeEntry[]> {
  const stdout = await git(repo, ['worktree', 'list', '--porcelain'], QUICK_MS)
  const entries: WorktreeEntry[] = []
  let current: Partial<WorktreeEntry> = {}

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('worktree ')) {
      current = { path: trimmed.slice('worktree '.length), branch: null }
      entries.push(current as WorktreeEntry)
    } else if (trimmed.startsWith('branch ')) {
      const ref = trimmed.slice('branch '.length)
      current.branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref
    }
  }
  return entries
}

export async function isValidBranchName(repo: string, branch: string): Promise<boolean> {
  try {
    await git(repo, ['check-ref-format', '--branch', branch], QUICK_MS)
    return true
  } catch {
    return false
  }
}

export async function localBranchExists(repo: string, branch: string): Promise<boolean> {
  try {
    await git(repo, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], QUICK_MS)
    return true
  } catch {
    return false
  }
}

export async function remoteBranchExists(repo: string, branch: string): Promise<boolean> {
  try {
    await git(repo, ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`], QUICK_MS)
    return true
  } catch {
    return false
  }
}

/**
 * `ls-remote` consulta el remoto pero no actualiza las refs locales, y el worktree
 * se crea desde `origin/<base>`. Sin este fetch se partiria de una base vieja.
 */
export async function fetchOrigin(repo: string): Promise<void> {
  await git(repo, ['fetch', 'origin'], FETCH_MS)
}

export function worktreePathFor(repo: string, dir: string, ticketKey: string): string {
  return resolve(join(repo, dir, ticketKey.toLowerCase()))
}

/** Hay cambios sin commitear en el arbol de trabajo. */
export async function isDirty(worktreePath: string): Promise<boolean> {
  const stdout = await git(worktreePath, ['status', '--porcelain'], QUICK_MS)
  return stdout.trim().length > 0
}

/**
 * Commits que solo existen aqui. Se compara contra el remoto de la propia rama
 * cuando existe; si la rama nunca se subio, contra la base.
 */
export async function unpushedCount(
  worktreePath: string,
  branch: string,
  baseBranch: string,
  hasRemote: boolean,
): Promise<number> {
  const upstream = hasRemote ? `origin/${branch}` : `origin/${baseBranch}`
  try {
    const stdout = await git(worktreePath, ['rev-list', '--count', `${upstream}..HEAD`], QUICK_MS)
    return Number.parseInt(stdout.trim(), 10) || 0
  } catch {
    // Base desconocida (remoto renombrado, rama huerfana): no se puede afirmar 0.
    return 0
  }
}

export async function branchIsMerged(
  repo: string,
  branch: string,
  baseBranch: string,
): Promise<boolean> {
  try {
    const stdout = await git(repo, ['branch', '--merged', `origin/${baseBranch}`], QUICK_MS)
    return stdout
      .split('\n')
      .map((l) => l.replace(/^[*+]?\s*/, '').trim())
      .includes(branch)
  } catch {
    return false
  }
}

export async function removeWorktree(
  repo: string,
  worktreePath: string,
  force: boolean,
): Promise<void> {
  const args = ['worktree', 'remove', worktreePath]
  if (force) args.push('--force')
  await git(repo, args, QUICK_MS)
}

export async function deleteBranch(repo: string, branch: string): Promise<void> {
  await git(repo, ['branch', '-D', branch], QUICK_MS)
}

export async function pruneWorktrees(repo: string): Promise<void> {
  await git(repo, ['worktree', 'prune'], QUICK_MS)
}

/**
 * Apunta `origin/HEAD` a `branch`.
 *
 * Claude Code deduce la rama principal de un repo leyendo esa referencia, no la
 * rama base configurada aqui. Si no coinciden, la sesion muestra la equivocada.
 * Es configuracion local del clon: no toca el remoto ni se sube.
 */
export async function setOriginHead(repo: string, branch: string): Promise<void> {
  await git(repo, ['remote', 'set-head', 'origin', branch], QUICK_MS)
}

/**
 * Fija el modo de permisos por defecto del worktree.
 *
 * Va en `.claude/settings.local.json` (tier `local`) y no en el `settings.json`
 * versionado: los modos elevados que llegan desde el tier `project` la app los
 * ignora, para que un repositorio no pueda auto-concederse permisos.
 *
 * Se fusiona con lo que ya hubiera en el archivo en vez de reemplazarlo.
 */
export async function setWorktreePermissionMode(
  worktreePath: string,
  mode: string,
): Promise<void> {
  const dir = join(worktreePath, '.claude')
  const file = join(dir, 'settings.local.json')

  let current: Record<string, unknown> = {}
  if (existsSync(file)) {
    try {
      current = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
    } catch {
      // Un archivo corrupto no debe tumbar la inicializacion; se reescribe.
      current = {}
    }
  }

  const permissions = (current['permissions'] as Record<string, unknown> | undefined) ?? {}
  const next = { ...current, permissions: { ...permissions, defaultMode: mode } }

  await mkdir(dir, { recursive: true })
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
}

export interface CreateWorktreeInput {
  repo: string
  worktreePath: string
  branch: string
  baseBranch: string
}

export interface CreateWorktreeResult {
  action: BranchAction
  created: boolean
}

export class WorktreeConflictError extends LocalizedError {}

/**
 * Deja listo un worktree en `worktreePath` apuntando a `branch`.
 * Idempotente: si ya existe con esa misma rama, lo reutiliza sin tocar nada.
 */
export async function createWorktree({
  repo,
  worktreePath,
  branch,
  baseBranch,
}: CreateWorktreeInput): Promise<CreateWorktreeResult> {
  const existing = (await listWorktrees(repo)).find((w) => samePath(w.path, worktreePath))

  if (existing) {
    if (existing.branch === branch) return { action: 'reused-worktree', created: false }
    throw new WorktreeConflictError(
      'err.worktreeOtherBranch',
      { path: worktreePath, branch: existing.branch ?? '(detached)' },
      409,
    )
  }

  // Carpeta sin registrar en git: restos de un borrado a mano. `worktree add`
  // fallaria con un mensaje opaco, asi que se explica antes.
  if (existsSync(worktreePath)) {
    throw new WorktreeConflictError('err.worktreeOrphanFolder', { path: worktreePath, repo }, 409)
  }

  const checkedOutElsewhere = (await listWorktrees(repo)).find((w) => w.branch === branch)
  if (checkedOutElsewhere) {
    throw new WorktreeConflictError(
      'err.branchInUse',
      { branch, path: checkedOutElsewhere.path },
      409,
    )
  }

  if (await localBranchExists(repo, branch)) {
    await git(repo, ['worktree', 'add', worktreePath, branch], ADD_MS)
    return { action: 'checked-out-local', created: true }
  }

  if (await remoteBranchExists(repo, branch)) {
    await git(
      repo,
      ['worktree', 'add', '--track', '-b', branch, worktreePath, `origin/${branch}`],
      ADD_MS,
    )
    return { action: 'tracked-remote', created: true }
  }

  await git(repo, ['worktree', 'add', '-b', branch, worktreePath, `origin/${baseBranch}`], ADD_MS)
  return { action: 'created-from-base', created: true }
}
