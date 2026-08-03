import { build } from 'esbuild'

/*
 * El servidor se empaqueta en un solo archivo con shebang.
 *
 * La alternativa era publicar el TypeScript y resolverlo con tsx en cada
 * arranque, pero eso suma un transpilado a cada `npx` y arrastra tsx como
 * dependencia de ejecucion. Empaquetar deja el arranque en un `node` limpio.
 *
 * Las dependencias quedan externas: npm ya las instala y meterlas en el bundle
 * solo duplicaria peso.
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
