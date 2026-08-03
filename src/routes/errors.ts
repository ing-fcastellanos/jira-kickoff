import type { FastifyReply } from 'fastify'
import { LocalizedError, langFrom, message, type MessageKey, type Vars } from '../messages'

/** Idioma pedido por el navegador en esta peticion. */
export function langOf(reply: FastifyReply) {
  return langFrom(reply.request.headers['accept-language'])
}

/** Mensaje suelto ya traducido, para los fallos que no viajan como excepcion. */
export function say(reply: FastifyReply, key: MessageKey, vars?: Vars): string {
  return message(langOf(reply), key, vars)
}

/**
 * Traduce los fallos conocidos y responde con el texto ya legible.
 *
 * La traduccion ocurre aqui y no donde se lanza el error: git, Jira y la
 * validacion no saben nada de la peticion, y el idioma solo se conoce en el
 * borde HTTP. Lo que no reconoce se relanza para el handler global.
 */
export function replyWithError(reply: FastifyReply, err: unknown, extra?: Record<string, unknown>) {
  if (err instanceof LocalizedError) {
    return reply.status(err.status).send({ error: err.localized(langOf(reply)), ...extra })
  }
  throw err
}
