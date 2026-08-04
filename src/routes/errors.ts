import type { FastifyReply } from 'fastify'
import { LocalizedError, langFrom, message, type MessageKey, type Vars } from '../messages'

/** Language requested by the browser on this request. */
export function langOf(reply: FastifyReply) {
  return langFrom(reply.request.headers['accept-language'])
}

/** A one-off translated message, for failures that do not travel as an exception. */
export function say(reply: FastifyReply, key: MessageKey, vars?: Vars): string {
  return message(langOf(reply), key, vars)
}

/**
 * Translates known failures and answers with the readable text.
 *
 * The translation happens here and not where the error is thrown: git, Jira and
 * validation know nothing about the request, and the language is only known at
 * the HTTP edge. What it does not recognize is rethrown for the global handler.
 */
export function replyWithError(reply: FastifyReply, err: unknown, extra?: Record<string, unknown>) {
  if (err instanceof LocalizedError) {
    return reply.status(err.status).send({ error: err.localized(langOf(reply)), ...extra })
  }
  throw err
}
