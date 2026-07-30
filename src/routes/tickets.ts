import type { FastifyPluginAsync } from 'fastify'
import type { TicketService } from '../ticket-service'
import { replyWithError } from './errors'

export const ticketRoutes: FastifyPluginAsync<{ tickets: TicketService }> = async (app, opts) => {
  const { tickets } = opts

  app.get<{ Querystring: { refresh?: string } }>('/api/tickets', async (req, reply) => {
    try {
      return await tickets.list(req.query.refresh !== undefined)
    } catch (err) {
      // La JQL sale de config.json, asi que un 400 casi siempre es un status o un
      // proyecto mal escrito ahi. Devolverla ahorra el diagnostico.
      return replyWithError(reply, err, { jql: tickets.jql })
    }
  })
}
