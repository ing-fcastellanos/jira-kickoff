import type { FastifyPluginAsync } from 'fastify'
import type { TicketService } from '../ticket-service'
import { replyWithError } from './errors'

export const ticketRoutes: FastifyPluginAsync<{ tickets: TicketService }> = async (app, opts) => {
  const { tickets } = opts

  app.get<{ Querystring: { refresh?: string } }>('/api/tickets', async (req, reply) => {
    try {
      return await tickets.list(req.query.refresh !== undefined)
    } catch (err) {
      // The JQL comes from config.json, so a 400 is almost always a status or a
      // project misspelled there. Returning it saves the diagnosis.
      return replyWithError(reply, err, { jql: tickets.jql })
    }
  })
}
