import { existsSync } from 'node:fs'
import { join } from 'node:path'
import Fastify from 'fastify'
import type { FastifyError, FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import { ConfigError, ConfigStore } from './config'
import { configPath, packageRoot, packageVersion } from './paths'
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

/*
 * `--version` is answered before anything else: without loading config.json,
 * without opening a port and without touching the browser. It is what every bug
 * report asks for, and one line carries the four things needed to reproduce it.
 */
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(
    `jira-kickoff ${packageVersion()} · node ${process.version} · ${process.platform} ${process.arch}`,
  )
  process.exit(0)
}

/** Ports to try if the preferred one is busy, before giving up. */
const PORT_ATTEMPTS = 20

async function listen(app: FastifyInstance, preferred: number): Promise<number> {
  const host = '127.0.0.1'
  for (let port = preferred; port < preferred + PORT_ATTEMPTS; port++) {
    try {
      await app.listen({ port, host })
      return port
    } catch (err) {
      // Another copy of the panel, or any other process: the next one is tried.
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err
    }
  }
  throw new Error(
    `Los puertos ${preferred}–${preferred + PORT_ATTEMPTS - 1} estan ocupados. ` +
      `Libera uno o define PORT.`,
  )
}

async function main(): Promise<void> {
  // The options screen writes config.json, so the configuration lives in a
  // reloadable store and not in an object read once at startup.
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

  // A single instance: the ticket cache is shared between routes.
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

  // Loopback only: this service runs git and opens sessions on your machine,
  // there is no reason for it to be reachable from the network.
  const port = await listen(app, store.get().port)
  const url = `http://127.0.0.1:${port}`
  const config = store.get()

  console.log(`\n  jira-kickoff ${packageVersion()}`)
  console.log(`  ${webBuilt ? url : `${url} (API) · http://127.0.0.1:5100 (vite dev)`}`)
  console.log(`  Configuración: ${configPath()}`)
  if (!config.configured) {
    console.log(`  Sin configurar todavía: el asistente se abre en el navegador.`)
  }
  console.log()

  // Opening the browser is the point of the `npx`: the first start should not
  // require reading terminal output to know where to go.
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
