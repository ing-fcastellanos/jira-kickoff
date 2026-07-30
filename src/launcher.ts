import { spawn } from 'node:child_process'
import { PROMPT_MAX_LENGTH } from './prompt'

/**
 * Deep link de la app de escritorio. Contrato leido del router de `app.asar`:
 *
 *   case Code:
 *     if (pathname !== "/new") -> "unrecognized code path"
 *     const u = searchParams.get("q") ?? searchParams.get("prompt")
 *     const f = searchParams.getAll("folder")
 *
 * Es interfaz interna, no publica: puede romperse en cualquier actualizacion.
 * Por eso `initialize` deja el worktree creado antes de intentar abrirla.
 */
export function buildDeepLink(prompt: string, folder: string): string {
  return `claude://code/new?q=${encode(prompt.slice(0, PROMPT_MAX_LENGTH))}&folder=${encode(folder)}`
}

/**
 * `encodeURIComponent` deja pasar la comilla simple, y en Windows la URL viaja
 * dentro de una cadena entrecomillada de PowerShell. Codificarla aqui evita
 * tener que confiar en el escapado mas abajo; la app la decodifica igual.
 */
function encode(value: string): string {
  return encodeURIComponent(value).replaceAll("'", '%27')
}

/**
 * Entrega la URL al manejador de protocolos del sistema.
 *
 * En Windows se usa `Start-Process` de PowerShell, que es ShellExecute. Se
 * probaron dos alternativas mas baratas y ninguna sirve:
 *   · `rundll32 url.dll,FileProtocolHandler` — la app recibe la invocacion pero
 *     pierde los parametros: el folder nunca llega.
 *   · `explorer.exe <url>` — no activa el protocolo, no pasa nada en absoluto.
 *
 * Que esto resuelva no significa que la sesion se haya abierto: solo que el
 * handler acepto la invocacion. La UI lo enuncia asi, sin prometer de mas.
 */
export function openUrl(url: string): Promise<void> {
  const [command, args] = launchCommand(url)
  return new Promise((resolve, reject) => {
    // Sin `detached`: el lanzador se espera a que termine. Al soltarlo y salir,
    // el hijo moria antes de invocar el protocolo y la app no recibia nada.
    // Ademas, esperar convierte el resultado en una senal real de exito.
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
