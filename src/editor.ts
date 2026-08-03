import { spawn } from 'node:child_process'
import { extname } from 'node:path'
import { LocalizedError, RawError } from './messages'

export class EditorError extends LocalizedError {}

/** Los lanzadores de editores en Windows son scripts (`code.cmd`), no ejecutables. */
const WINDOWS_SCRIPTS = new Set(['.cmd', '.bat'])

function isWindowsScript(command: string): boolean {
  const ext = extname(command).toLowerCase()
  // Sin extension tambien: `code` resuelve a `code.cmd` a traves del PATHEXT.
  return process.platform === 'win32' && (ext === '' || WINDOWS_SCRIPTS.has(ext))
}

/**
 * Abre una ruta en el editor configurado.
 *
 * `{{path}}` se sustituye en los argumentos, para que cualquier editor encaje
 * sin tocar codigo: `code -n {{path}}`, `cursor {{path}}`, `idea {{path}}`…
 *
 * En Windows se pasa por `cmd.exe /c` porque `spawn` no ejecuta un `.cmd`
 * directamente. Los argumentos van en un array, nunca concatenados en una
 * cadena: una ruta con espacios o con `&` romperia el comando.
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
      // El stderr del editor, si lo hay, dice mas que cualquier texto nuestro.
      else if (stderr.trim()) reject(new RawError(stderr.trim()))
      else reject(new EditorError('err.editorExit', { command, code: code ?? 'null' }, 502))
    })
  })
}
