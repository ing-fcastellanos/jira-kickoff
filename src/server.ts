import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import type { FastifyError } from 'fastify'
import fastifyStatic from '@fastify/static'
import { ConfigError, ConfigStore } from './config'
import { healthRoutes } from './routes/health'
import { ticketRoutes } from './routes/tickets'
import { branchRoutes } from './routes/branches'
import { initializeRoutes } from './routes/initialize'
import { worktreeRoutes } from './routes/worktrees'
import { settingsRoutes } from './routes/settings'
import { activityRoutes } from './routes/activity'
import { HistoryStore } from './history'
import { TicketService } from './ticket-service'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function main(): Promise<void> {
  // La pantalla de opciones escribe config.json, asi que la configuracion vive
  // en un store recargable y no en un objeto leido una sola vez al arrancar.
  const store = ConfigStore.load(rootDir)
  const config = store.get()
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
  const history = HistoryStore.load(rootDir)

  await app.register(healthRoutes, { store })
  await app.register(ticketRoutes, { tickets })
  await app.register(branchRoutes, { store, tickets })
  await app.register(initializeRoutes, { store, tickets, history })
  await app.register(worktreeRoutes, { store })
  await app.register(settingsRoutes, { store })
  await app.register(activityRoutes, { store, history })

  // La UI compilada solo existe despues de `npm run build`. En desarrollo la
  // sirve Vite en :5100 y proxea /api hasta aca, asi que su ausencia es normal.
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
  const host = '127.0.0.1'
  await app.listen({ port: config.port, host })

  const projects = Object.keys(config.projects).join(', ')
  console.log(`\n  jira-ticket-workflow`)
  console.log(`  API        http://${host}:${config.port}/api/health`)
  console.log(`  UI         ${webBuilt ? `http://${host}:${config.port}` : 'http://127.0.0.1:5100 (vite dev)'}`)
  console.log(`  Proyectos  ${projects}`)
  console.log(`  Jira       ${config.jira.site}\n`)
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    console.error(`\n  Configuracion invalida\n\n${err.message}\n`)
  } else {
    console.error('\n  El servidor no pudo arrancar:\n', err)
  }
  process.exitCode = 1
})
