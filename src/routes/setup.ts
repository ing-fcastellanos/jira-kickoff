import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { ConfigStore } from '../config'
import { JiraClient, JiraError } from '../jira'
import { writeCredentials } from '../credentials'
import { configPath, credentialsPath } from '../paths'
import { langOf, say } from './errors'
import { LocalizedError } from '../messages'

const credentialsBody = z.object({
  site: z.string().min(1),
  email: z.string().min(1),
  token: z.string().min(1),
})

export interface SetupState {
  configured: boolean
  hasCredentials: boolean
  email: string | null
  site: string
  projectCount: number
  paths: { config: string; credentials: string }
}

/** Accepts `acme.atlassian.net`, with or without a scheme, and returns a clean origin. */
export function normalizeSite(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return new URL(withScheme).origin
}

export const setupRoutes: FastifyPluginAsync<{ store: ConfigStore }> = async (app, opts) => {
  const { store } = opts

  app.get('/api/setup', async () => {
    const c = store.get()
    const state: SetupState = {
      configured: c.configured,
      hasCredentials: Boolean(c.jiraEmail && c.jiraToken),
      email: c.jiraEmail,
      site: c.jira.site,
      projectCount: Object.keys(c.projects).length,
      paths: { config: configPath(), credentials: credentialsPath() },
    }
    return state
  })

  /**
   * Saves the credentials only after Jira accepts them.
   *
   * Writing first and failing afterwards would leave the user with an invalid
   * token on disk and no idea why they see nothing; the round trip to Jira costs
   * less than that diagnosis.
   */
  app.post('/api/setup/credentials', async (req, reply) => {
    const parsed = credentialsBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      })
    }

    let site: string
    try {
      site = normalizeSite(parsed.data.site)
    } catch {
      return reply.status(400).send({ error: say(reply, 'err.badSite', { site: parsed.data.site }) })
    }

    const client = new JiraClient({
      site,
      email: parsed.data.email.trim(),
      token: parsed.data.token.trim(),
    })

    let displayName: string
    try {
      displayName = (await client.myself()).displayName
    } catch (err) {
      // `err.message` always comes in English, so that traces read without
      // request context. What the user sees has to go through here.
      if (err instanceof LocalizedError) {
        return reply.status(400).send({ error: err.localized(langOf(reply)) })
      }
      return reply
        .status(400)
        .send({ error: say(reply, 'err.checkFailed', { detail: (err as Error).message }) })
    }

    writeCredentials({ jiraEmail: parsed.data.email.trim(), jiraToken: parsed.data.token.trim() })

    // The site goes in the configuration; the token, in the separate file.
    const current = store.get()
    const { port: _p, jiraEmail: _e, jiraToken: _t, configured: _c, ...file } = current
    store.save({ ...file, jira: { ...file.jira, site } })

    return { ok: true, displayName, site }
  })
}
