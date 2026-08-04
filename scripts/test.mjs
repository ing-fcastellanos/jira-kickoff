import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

/*
 * Los tests se buscan aqui en vez de con un glob en el script de npm.
 *
 * `src/**\/*.test.ts` depende de quien expanda el patron: cmd.exe no lo hace,
 * sh sin globstar lo colapsa a un solo nivel y node solo resuelve globs desde
 * la 21. Con `engines: node >=20` eso significa que el mismo comando pasa en
 * una maquina y falla en otra -- justo lo que no puede pasar en CI.
 *
 * tsx se invoca como `node --import tsx` y no por su binario: en Windows es un
 * `.cmd` y spawn no ejecuta scripts de shell directamente.
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
  console.error('No se encontro ningun archivo *.test.ts en src/')
  process.exit(1)
}

const { status } = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', ...tests],
  { stdio: 'inherit' },
)

process.exit(status ?? 1)
