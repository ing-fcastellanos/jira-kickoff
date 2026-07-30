import type { FastifyReply } from 'fastify'
import { JiraError } from '../jira'
import { GitError } from '../git'
import { MissingCredentialsError, NoProjectsEnabledError } from '../ticket-service'

/**
 * Traduce los fallos conocidos a una respuesta con texto ya legible.
 * Lo que no reconoce se relanza para que lo tome el handler global.
 */
export function replyWithError(reply: FastifyReply, err: unknown, extra?: Record<string, unknown>) {
  if (err instanceof MissingCredentialsError) {
    return reply.status(503).send({ error: err.message, ...extra })
  }
  if (err instanceof NoProjectsEnabledError) {
    return reply.status(400).send({ error: err.message, ...extra })
  }
  if (err instanceof JiraError) {
    return reply.status(err.status === 401 ? 401 : 502).send({ error: err.message, ...extra })
  }
  if (err instanceof GitError) {
    return reply.status(502).send({ error: err.message, ...extra })
  }
  throw err
}
