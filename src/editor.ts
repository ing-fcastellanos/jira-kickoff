import { spawn } from 'node:child_process'
import { extname } from 'node:path'
import { LocalizedError, RawError } from './messages'

export class EditorError extends LocalizedError {}

/** Editor launchers on Windows are scripts (`code.cmd`), not executables. */
const WINDOWS_SCRIPTS = new Set(['.cmd', '.bat'])

function isWindowsScript(command: string): boolean {
  const ext = extname(command).toLowerCase()
  // Extensionless too: `code` resolves to `code.cmd` through PATHEXT.
  return process.platform === 'win32' && (ext === '' || WINDOWS_SCRIPTS.has(ext))
}

/**
 * Opens a path in the configured editor.
 *
 * `{{path}}` is substituted in the arguments, so that any editor fits without
 * touching code: `code -n {{path}}`, `cursor {{path}}`, `idea {{path}}`…
 *
 * On Windows it goes through `cmd.exe /c` because `spawn` does not run a `.cmd`
 * directly. The arguments go in an array, never concatenated into a string: a
 * path with spaces or with `&` would break the command.
 */
export function openInEditor(command: string, args: string[], path: string): Promise<void> {
  const rendered = args.map((a) => a.replaceAll('{{path}}', path))

  const [bin, finalArgs] = isWindowsScript(command)
    ? ['cmd.exe', ['/c', command, ...rendered]]
    : [command, rendered]

  return new Promise((resolve, reject) => {
    const child = spawn(bin, finalArgs, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.once('error', (err: Error) => {
      reject(new EditorError('err.editorFailed', { command, detail: err.message }, 502))
    })

    child.once('close', (code) => {
      if (code === 0) resolve()
      // The editor's stderr, if any, says more than any text of ours.
      else if (stderr.trim()) reject(new RawError(stderr.trim()))
      else reject(new EditorError('err.editorExit', { command, code: code ?? 'null' }, 502))
    })
  })
}
