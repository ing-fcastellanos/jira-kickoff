import { existsSync } from 'node:fs'
import { join } from 'node:path'
import Fastify from 'fastify'
import type { FastifyError, FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import { ConfigError, ConfigStore } from './config'
import { configPath, packageRoot } from './paths'
import { openUrl } from './launcher'
import { healthRoutes } from './routes/health'
import { ticketRoutes } from './routes/tickets'
import { branchRoutes } from './routes/branches'
import { initializeRoutes } from './routes/initialize'
import { worktreeRoutes } from './routes/worktrees'
import { settingsRoutes } from './routes/settings'
import { activityRoutes } from './routes/activity'
import { detailRoutes } from './routes/detail'
import { setupRoutes } from './routes/setup'
import { TicketService } from './ticket-service'
import { HistoryStore } from './history'

const rootDir = packageRoot()

/** Puertos a probar si el preferido esta ocupado, antes de rendirse. */
const PORT_ATTEMPTS = 20

async function listen(app: FastifyInstance, preferred: number): Promise<number> {
  const host = '127.0.0.1'
  for (let port = preferred; port < preferred + PORT_ATTEMPTS; port++) {
    try {
      await app.listen({ port, host })
      return port
    } catch (err) {
      // Otra copia del panel, o cualquier otro proceso: se prueba el siguiente.
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err
    }
  }
  throw new Error(
    `Los puertos ${preferred}–${preferred + PORT_ATTEMPTS - 1} estan ocupados. ` +
      `Libera uno o define PORT.`,
  )
}

async function main(): Promise<void> {
  // La pantalla de opciones escribe config.json, asi que la configuracion vive
  // en un store recargable y no en un objeto leido una sola vez al arrancar.
  const store = ConfigStore.load(rootDir)
  const app = Fastify({ logger: false })

  app.addHook('onResponse', (req, reply, done) => {
    if (req.url.startsWith('/api')) {
      console.log(`  ${req.method} ${req.url} → ${reply.statusCode}`)
    }
    done()
  })

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    console.error(`  ! ${err.message}`)
    reply.status(err.statusCode ?? 500).send({ error: err.message })
  })

  // Una sola instancia: la cache de tickets se comparte entre rutas.
  const tickets = new TicketService(store)
  const history = HistoryStore.load()

  await app.register(setupRoutes, { store })
  await app.register(healthRoutes, { store })
  await app.register(ticketRoutes, { tickets })
  await app.register(branchRoutes, { store, tickets })
  await app.register(initializeRoutes, { store, tickets, history })
  await app.register(worktreeRoutes, { store })
  await app.register(settingsRoutes, { store })
  await app.register(activityRoutes, { store, history })
  await app.register(detailRoutes, { store })

  const webDir = join(rootDir, 'dist', 'web')
  const webBuilt = existsSync(join(webDir, 'index.html'))

  if (webBuilt) {
    await app.register(fastifyStatic, { root: webDir })
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api')) {
        reply.status(404).send({ error: `Ruta desconocida: ${req.url}` })
        return
      }
      reply.sendFile('index.html')
    })
  }

  // Solo loopback: este servicio ejecuta git y abre sesiones en tu maquina,
  // no tiene por que ser alcanzable desde la red.
  const port = await listen(app, store.get().port)
  const url = `http://127.0.0.1:${port}`
  const config = store.get()

  console.log(`\n  jira-kickoff`)
  console.log(`  ${webBuilt ? url : `${url} (API) · http://127.0.0.1:5100 (vite dev)`}`)
  console.log(`  Configuración: ${configPath()}`)
  if (!config.configured) {
    console.log(`  Sin configurar todavía: el asistente se abre en el navegador.`)
  }
  console.log()

  // Abrir el navegador es el punto del `npx`: que el primer arranque no exija
  // leer la salida de la terminal para saber a donde ir.
  if (webBuilt && process.env.JTW_NO_OPEN !== '1' && !process.argv.includes('--no-open')) {
    openUrl(url).catch(() => {
      console.log(`  Abre ${url} en tu navegador.`)
    })
  }
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    console.error(`\n  Configuración inválida\n\n${err.message}\n`)
  } else {
    console.error('\n  El servidor no pudo arrancar:\n', err)
  }
  process.exitCode = 1
})
