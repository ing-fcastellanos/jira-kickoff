import { build } from 'esbuild'

/*
 * The server is bundled into a single file with a shebang.
 *
 * The alternative was to publish the TypeScript and resolve it with tsx on every
 * start, but that adds a transpile to every `npx` and drags tsx in as a runtime
 * dependency. Bundling leaves the start as a clean `node`.
 *
 * Dependencies stay external: npm already installs them and putting them in the
 * bundle would only duplicate weight.
 */
await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  packages: 'external',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
})
