import type { FastifyPluginAsync } from 'fastify'
import type { ConfigStore } from '../config'
import type { TicketService } from '../ticket-service'
import type { Branch, BranchesResponse } from '../types'
import { GitError, localBranches, remoteBranches } from '../git'
import { matchesTicket, suggestBranchName } from '../branch-name'
import { replyWithError } from './errors'

function merge(remote: string[], local: string[]): Branch[] {
  const names = new Set([...remote, ...local])
  const remoteSet = new Set(remote)
  const localSet = new Set(local)
  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, remote: remoteSet.has(name), local: localSet.has(name) }))
}

export const branchRoutes: FastifyPluginAsync<{
  store: ConfigStore
  tickets: TicketService
}> = async (app, opts) => {
  const { store, tickets } = opts

  app.get<{ Params: { ticketKey: string } }>('/api/branches/:ticketKey', async (req, reply) => {
    const config = store.get()
    const ticketKey = req.params.ticketKey.toUpperCase()

    let ticket
    try {
      ticket = await tickets.find(ticketKey)
    } catch (err) {
      return replyWithError(reply, err)
    }

    if (!ticket) {
      return reply.status(404).send({ error: `${ticketKey} no esta entre tus tickets abiertos.` })
    }

    const project = config.projects[ticket.projectKey]
    if (!project) {
      return reply.status(400).send({
        error: `El proyecto ${ticket.projectKey} no esta en config.json.`,
      })
    }

    const suggested = suggestBranchName({
      pattern: config.branch.pattern,
      ticketKey: ticket.key,
      summary: ticket.summary,
      slugMaxLength: config.branch.slugMaxLength,
    })

    // Si el remoto no responde seguimos con lo local: saber que ya existe una
    // rama para el ticket vale mas que fallar la pantalla entera.
    let remote: string[] = []
    let remoteError: string | null = null
    try {
      remote = await remoteBranches(project.repo)
    } catch (err) {
      if (!(err instanceof GitError)) throw err
      remoteError = err.message
    }

    let local: string[]
    try {
      local = await localBranches(project.repo)
    } catch (err) {
      return replyWithError(reply, err)
    }

    const branches = merge(remote, local)

    const payload: BranchesResponse = {
      projectKey: ticket.projectKey,
      repo: project.repo,
      baseBranch: project.baseBranch,
      suggested,
      matches: branches.filter((b) => matchesTicket(b.name, ticket.key)),
      branches,
      remoteError,
      fetchedAt: new Date().toISOString(),
    }
    return payload
  })
}
