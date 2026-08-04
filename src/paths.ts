import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = 'jira-kickoff'

/**
 * Package root, searching upwards for package.json.
 *
 * The number of hops cannot be fixed: running from source the module is in
 * `src/`, and bundled it is in `dist/server/`. Looking for the marker works in
 * both cases and survives a change in the output structure.
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
 * Published version, read from package.json on every start.
 *
 * The JSON is not imported: that requires `with { type: 'json' }` and esbuild
 * would end up baking the number into the bundle, which is exactly what we do
 * not want if someone patches the package by hand. package.json always travels
 * in the npm tarball, so the file is where `packageRoot` looks for it.
 */
export function packageVersion(): string {
  try {
    const raw = readFileSync(join(packageRoot(), 'package.json'), 'utf8')
    return (JSON.parse(raw) as { version?: string }).version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * The user's configuration folder.
 *
 * Run with `npx`, the package lives in a temporary cache that npm may delete:
 * storing the configuration there would mean losing it. It goes in the user's
 * folder, following each system's convention.
 *
 * `JTW_CONFIG_DIR` overrides it, which is what makes it possible to test without
 * touching the real configuration of whoever runs it.
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
 * Credentials are kept apart from the rest of the configuration on purpose:
 * config.json gets shared, pasted into an issue or caught in a screenshot, and
 * the Jira token should not travel with it.
 */
export function credentialsPath(): string {
  return join(configDir(), 'credentials.json')
}
