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
/** `fetch` goes to the network and a repo with years of history takes longer than it looks. */
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

/** Normalizes separators: git answers with `/` even on Windows. */
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
 * `ls-remote` queries the remote but does not update local refs, and the worktree
 * is created from `origin/<base>`. Without this fetch it would start from a stale
 * base.
 */
export async function fetchOrigin(repo: string): Promise<void> {
  await git(repo, ['fetch', 'origin'], FETCH_MS)
}

export function worktreePathFor(repo: string, dir: string, ticketKey: string): string {
  return resolve(join(repo, dir, ticketKey.toLowerCase()))
}

/** There are uncommitted changes in the working tree. */
export async function isDirty(worktreePath: string): Promise<boolean> {
  const stdout = await git(worktreePath, ['status', '--porcelain'], QUICK_MS)
  return stdout.trim().length > 0
}

/**
 * Commits that only exist here. Compared against the branch's own remote when it
 * exists; if the branch was never pushed, against the base.
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
    // Unknown base (renamed remote, orphan branch): 0 cannot be asserted.
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
 * Points `origin/HEAD` at `branch`.
 *
 * Claude Code works out a repo's main branch by reading that reference, not the
 * base branch configured here. If they disagree, the session shows the wrong one.
 * This is local configuration of the clone: it does not touch the remote and is
 * never pushed.
 */
export async function setOriginHead(repo: string, branch: string): Promise<void> {
  await git(repo, ['remote', 'set-head', 'origin', branch], QUICK_MS)
}

/**
 * Sets the worktree's default permission mode.
 *
 * It goes in `.claude/settings.local.json` (`local` tier) and not in the
 * versioned `settings.json`: elevated modes arriving from the `project` tier are
 * ignored by the app, so that a repository cannot grant itself permissions.
 *
 * It is merged with whatever was already in the file instead of replacing it.
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
      // A corrupt file must not bring down the initialization; it gets rewritten.
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
 * Leaves a worktree ready at `worktreePath` pointing at `branch`.
 * Idempotent: if it already exists with that same branch, it is reused untouched.
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

  // Folder not registered in git: leftovers from a manual delete. `worktree add`
  // would fail with an opaque message, so it is explained beforehand.
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
