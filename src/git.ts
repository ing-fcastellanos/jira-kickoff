import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { LocalizedError, RawError } from './messages'

const run = promisify(execFile)

/** `ls-remote` sale a la red; sin tope, una VPN caida cuelga la peticion entera. */
const REMOTE_TIMEOUT_MS = 20_000
const LOCAL_TIMEOUT_MS = 5_000

/** Lo que sale de git es diagnostico real; se muestra sin traducir. */
export class GitError extends RawError {}

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

/**
 * Ramas del remoto. Usa las credenciales que git ya tiene configuradas
 * (en Windows, Git Credential Manager), asi que no hace falta token de GitHub.
 */
export async function remoteBranches(repo: string): Promise<string[]> {
  const stdout = await git(repo, ['ls-remote', '--heads', 'origin'], REMOTE_TIMEOUT_MS)
  return stdout
    .split('\n')
    .map((line) => line.split('\t')[1])
    .filter((ref): ref is string => Boolean(ref?.startsWith('refs/heads/')))
    .map((ref) => ref.slice('refs/heads/'.length))
}

export async function localBranches(repo: string): Promise<string[]> {
  const stdout = await git(
    repo,
    ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
    LOCAL_TIMEOUT_MS,
  )
  return stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}
