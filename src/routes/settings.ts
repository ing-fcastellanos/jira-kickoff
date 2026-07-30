import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { ConfigError, type ConfigStore, type FileConfig } from '../config'
import { suggestBranchName } from '../branch-name'
import { PROMPT_MAX_LENGTH, PROMPT_WARN_LENGTH } from '../prompt'

/** Placeholders que la UI ofrece; la lista vive aqui para no duplicarla en el cliente. */
const PLACEHOLDERS = [
  { token: '{{ticket}}', description: 'Clave del ticket, p. ej. ABC-123' },
  { token: '{{summary}}', description: 'Titulo del ticket' },
  { token: '{{url}}', description: 'Enlace al ticket en Jira' },
  { token: '{{branch}}', description: 'Rama elegida al inicializar' },
  { token: '{{repo}}', description: 'Ruta local del repositorio' },
  { token: '{{worktree}}', description: 'Ruta del worktree que se creara' },
]

const BRANCH_PLACEHOLDERS = [
  { token: '{{ticket}}', description: 'Clave tal cual, p. ej. ABC-123' },
  { token: '{{ticket-lower}}', description: 'Clave en minusculas, p. ej. abc-123' },
  { token: '{{slug}}', description: 'Titulo del ticket normalizado' },
]

const previewBody = z.object({
  pattern: z.string().min(1),
  slugMaxLength: z.number().int().positive(),
  summary: z.string().default('Ejemplo de titulo de un ticket cualquiera'),
  ticketKey: z.string().default('ABC-123'),
})

export interface SettingsResponse {
  config: FileConfig
  placeholders: typeof PLACEHOLDERS
  branchPlaceholders: typeof BRANCH_PLACEHOLDERS
  promptLimits: { max: number; warn: number }
  /** Solo informativo: el token vive en .env y no se edita desde la web. */
  credentials: { configured: boolean; email: string | null }
}

export const settingsRoutes: FastifyPluginAsync<{ store: ConfigStore }> = async (app, opts) => {
  const { store } = opts

  app.get('/api/settings', async () => {
    const config = store.get()
    const { port: _port, jiraEmail, jiraToken, ...file } = config
    const payload: SettingsResponse = {
      config: file,
      placeholders: PLACEHOLDERS,
      branchPlaceholders: BRANCH_PLACEHOLDERS,
      promptLimits: { max: PROMPT_MAX_LENGTH, warn: PROMPT_WARN_LENGTH },
      credentials: { configured: Boolean(jiraEmail && jiraToken), email: jiraEmail },
    }
    return payload
  })

  app.put('/api/settings', async (req, reply) => {
    try {
      const saved = store.save(req.body)
      const { port: _port, jiraEmail: _e, jiraToken: _t, ...file } = saved
      return { config: file }
    } catch (err) {
      if (err instanceof ConfigError) {
        return reply.status(400).send({ error: err.message })
      }
      throw err
    }
  })

  /** Vista previa del nombre de rama sin llegar a guardar el patron. */
  app.post('/api/settings/preview-branch', async (req, reply) => {
    const parsed = previewBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      })
    }
    return { example: suggestBranchName(parsed.data) }
  })
}
