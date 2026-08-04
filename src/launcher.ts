import { spawn } from 'node:child_process'
import { PROMPT_MAX_LENGTH } from './prompt'

/**
 * Desktop app deep link. Contract read from the `app.asar` router:
 *
 *   case Code:
 *     if (pathname !== "/new") -> "unrecognized code path"
 *     const u = searchParams.get("q") ?? searchParams.get("prompt")
 *     const f = searchParams.getAll("folder")
 *
 * This is an internal interface, not a public one: it can break in any update.
 * That is why `initialize` leaves the worktree created before trying to open it.
 */
export function buildDeepLink(prompt: string, folder: string): string {
  return `claude://code/new?q=${encode(prompt.slice(0, PROMPT_MAX_LENGTH))}&folder=${encode(folder)}`
}

/**
 * `encodeURIComponent` lets the single quote through, and on Windows the URL
 * travels inside a quoted PowerShell string. Encoding it here avoids having to
 * trust the escaping further down; the app decodes it all the same.
 */
function encode(value: string): string {
  return encodeURIComponent(value).replaceAll("'", '%27')
}

/**
 * Hands the URL to the system's protocol handler.
 *
 * On Windows it uses PowerShell's `Start-Process`, which is ShellExecute. Two
 * cheaper alternatives were tried and neither works:
 *   · `rundll32 url.dll,FileProtocolHandler` — the app receives the invocation
 *     but loses the parameters: the folder never arrives.
 *   · `explorer.exe <url>` — does not trigger the protocol, nothing happens.
 *
 * This resolving does not mean the session opened: only that the handler
 * accepted the invocation. The UI words it that way, without promising more.
 */
export function openUrl(url: string): Promise<void> {
  const [command, args] = launchCommand(url)
  return new Promise((resolve, reject) => {
    // No `detached`: the launcher is waited on. Releasing it and exiting made the
    // child die before invoking the protocol and the app received nothing.
    // Waiting also turns the result into a real signal of success.
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.once('error', (err: Error) => {
      reject(new Error(`No pude invocar el manejador de protocolos: ${err.message}`))
    })

    child.once('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `El lanzador termino con codigo ${code ?? 'null'}.`))
    })
  })
}

function launchCommand(url: string): [string, string[]] {
  switch (process.platform) {
    case 'win32':
      return [
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Start-Process -FilePath '${url.replaceAll("'", "''")}'`,
        ],
      ]
    case 'darwin':
      return ['open', [url]]
    default:
      return ['xdg-open', [url]]
  }
}
