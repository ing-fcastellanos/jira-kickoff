import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { GitError } from './git'
import { LocalizedError } from './messages'
import type { BranchAction } from './types'

const run = promisify(execFile)

const QUICK_MS = 10_000
/** `fetch` goes to the network and a repo with years of history takes longer than it looks. */
const FETCH_MS = 90_000
const ADD_MS = 120_000
/** `status` walks the whole working tree: with node_modules installed it is not a quick command. */
const STATUS_MS = 30_000
/**
 * Deleting is measured in files, not in commits: a worktree with dependencies
 * installed is tens of thousands of them and on Windows that is half a minute of
 * real work (30k files ≈ 14s measured). The old 10s cap killed `git worktree
 * remove` halfway through, which is worse than slow — see `isLeftover`.
 */
const REMOVE_MS = 300_000

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
  /**
   * git no longer considers the entry alive: its administrative link does not
   * resolve. In practice it is what an interrupted removal leaves behind.
   */
  prunable: boolean
}

/** Normalizes separators: git answers with `/` even on Windows. */
function samePath(a: string, b: string): boolean {
  const norm = (p: string) => resolve(p).replace(/\\/g, '/').toLowerCase()
  return norm(a) === norm(b)
}

/** Split out from `listWorktrees` so the porcelain format can be tested without a repo. */
export function parseWorktreeList(stdout: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  let current: WorktreeEntry | null = null

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('worktree ')) {
      current = { path: trimmed.slice('worktree '.length), branch: null, prunable: false }
      entries.push(current)
    } else if (!current) {
      continue
    } else if (trimmed.startsWith('branch ')) {
      const ref = trimmed.slice('branch '.length)
      current.branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref
    } else if (trimmed === 'prunable' || trimmed.startsWith('prunable ')) {
      current.prunable = true
    }
  }
  return entries
}

export async function listWorktrees(repo: string): Promise<WorktreeEntry[]> {
  return parseWorktreeList(await git(repo, ['worktree', 'list', '--porcelain'], QUICK_MS))
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
  const stdout = await git(worktreePath, ['status', '--porcelain'], STATUS_MS)
  return stdout.trim().length > 0
}

/**
 * Commits that only exist here. Compared against the branch's own remote when it
 * exists; if the branch was never pushed —or there is no branch at all, which is
 * how the explore sessions leave the worktree— against the base.
 */
export async function unpushedCount(
  worktreePath: string,
  branch: string | null,
  baseBranch: string,
  hasRemote: boolean,
): Promise<number> {
  const upstream = hasRemote && branch ? `origin/${branch}` : `origin/${baseBranch}`
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

/**
 * What an interrupted removal leaves behind.
 *
 * `git worktree remove` deletes the `.git` link before the files. If it is cut
 * short —as the old 10s cap did on any worktree with dependencies installed—
 * what is left is a folder that git refuses to touch ever again: every later
 * attempt dies with `validation failed … '.git' does not exist`, and the entry
 * can never be removed from the panel. Nothing but the filesystem clears it.
 */
function isLeftover(worktreePath: string): boolean {
  return existsSync(worktreePath) && !existsSync(join(worktreePath, '.git'))
}

export async function removeWorktree(
  repo: string,
  worktreePath: string,
  force: boolean,
): Promise<void> {
  if (isLeftover(worktreePath)) {
    // The retries are for Windows: an indexer or an editor holds a handle for a
    // moment and the first unlink fails with EBUSY on a folder that is going away.
    await rm(worktreePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    await pruneWorktrees(repo)
    return
  }

  const args = ['worktree', 'remove', worktreePath]
  if (force) args.push('--force')
  await git(repo, args, REMOVE_MS)
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

/** Reads the worktree's `.claude/settings.local.json`, or `{}` if missing or corrupt. */
async function readWorktreeSettings(worktreePath: string): Promise<Record<string, unknown>> {
  const file = join(worktreePath, '.claude', 'settings.local.json')
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
  } catch {
    // A corrupt file must not bring down the initialization; it gets rewritten.
    return {}
  }
}

async function writeWorktreeSettings(
  worktreePath: string,
  next: Record<string, unknown>,
): Promise<void> {
  const dir = join(worktreePath, '.claude')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'settings.local.json'), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
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
  const current = await readWorktreeSettings(worktreePath)
  const permissions = (current['permissions'] as Record<string, unknown> | undefined) ?? {}
  await writeWorktreeSettings(worktreePath, {
    ...current,
    permissions: { ...permissions, defaultMode: mode },
  })
}

/**
 * Sets the model a new session starts with, the same way and for the same
 * reason as `setWorktreePermissionMode`: the deep link has no room for it, so
 * it is written into the worktree before the session opens.
 */
export async function setWorktreeModel(worktreePath: string, model: string): Promise<void> {
  const current = await readWorktreeSettings(worktreePath)
  await writeWorktreeSettings(worktreePath, { ...current, model })
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
