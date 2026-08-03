import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = 'jira-kickoff'

/**
 * Raiz del paquete, buscando el package.json hacia arriba.
 *
 * No se puede fijar el numero de saltos: ejecutando desde fuente el modulo esta
 * en `src/`, y empaquetado en `dist/server/`. Buscar el marcador funciona en
 * ambos casos y sobrevive a que cambie la estructura de salida.
 */
export function packageRoot(from = dirname(fileURLToPath(import.meta.url))): string {
  let dir = from
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return from
}

/**
 * Carpeta de configuracion del usuario.
 *
 * Ejecutado con `npx`, el paquete vive en una cache temporal que npm puede
 * borrar: guardar ahi la configuracion seria perderla. Va en la carpeta del
 * usuario, siguiendo la convencion de cada sistema.
 *
 * `JTW_CONFIG_DIR` la sobreescribe, que es lo que permite probar sin tocar la
 * configuracion real de quien ejecuta.
 */
export function configDir(): string {
  const override = process.env.JTW_CONFIG_DIR?.trim()
  if (override) return override

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (appData) return join(appData, APP)
    return join(homedir(), 'AppData', 'Roaming', APP)
  }

  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', APP)
  }

  const xdg = process.env.XDG_CONFIG_HOME?.trim()
  return join(xdg || join(homedir(), '.config'), APP)
}

export function configPath(): string {
  return join(configDir(), 'config.json')
}

/**
 * Las credenciales van aparte del resto de la configuracion a proposito:
 * config.json se comparte, se pega en un issue o sale en una captura, y el
 * token de Jira no debe viajar con el.
 */
export function credentialsPath(): string {
  return join(configDir(), 'credentials.json')
}
