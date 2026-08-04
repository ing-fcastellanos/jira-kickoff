import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

/*
 * The tests are discovered here instead of with a glob in the npm script.
 *
 * `src/**\/*.test.ts` depends on who expands the pattern: cmd.exe does not,
 * sh without globstar collapses it to a single level, and node only resolves
 * globs from 21 onwards. With `engines: node >=20` that means the same command
 * passes on one machine and fails on another -- exactly what cannot happen in CI.
 *
 * tsx is invoked as `node --import tsx` and not through its binary: on Windows
 * it is a `.cmd` and spawn does not run shell scripts directly.
 */
function findTests(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...findTests(path))
    else if (entry.name.endsWith('.test.ts')) found.push(path)
  }
  return found
}

const tests = findTests('src')

if (tests.length === 0) {
  console.error('No *.test.ts file found in src/')
  process.exit(1)
}

const { status } = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', ...tests],
  { stdio: 'inherit' },
)

process.exit(status ?? 1)
