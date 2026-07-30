import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { GitError } from './git'
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
    if (e.killed) throw new GitError(`\`git ${args[0]}\` excedio ${timeout / 1000}s.`)
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

export class WorktreeConflictError extends Error {}

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
      `Ya hay un worktree en ${worktreePath} sobre la rama "${existing.branch ?? '(detached)'}". ` +
        `Elige esa rama para retomarlo, o quitalo con \`git worktree remove\`.`,
    )
  }

  // Carpeta sin registrar en git: restos de un borrado a mano. `worktree add`
  // fallaria con un mensaje opaco, asi que se explica antes.
  if (existsSync(worktreePath)) {
    throw new WorktreeConflictError(
      `La carpeta ${worktreePath} existe pero git no la conoce como worktree. ` +
        `Borrala o ejecuta \`git worktree prune\` en ${repo}.`,
    )
  }

  const checkedOutElsewhere = (await listWorktrees(repo)).find((w) => w.branch === branch)
  if (checkedOutElsewhere) {
    throw new WorktreeConflictError(
      `La rama "${branch}" ya esta usada por el worktree ${checkedOutElsewhere.path}. ` +
        `Git no permite la misma rama en dos worktrees.`,
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
