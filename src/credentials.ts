import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { configDir, credentialsPath } from './paths'

const schema = z.object({
  jiraEmail: z.string().min(1),
  jiraToken: z.string().min(1),
})

export interface Credentials {
  jiraEmail: string
  jiraToken: string
}

/**
 * Credenciales de Jira.
 *
 * Las variables de entorno ganan al archivo: es lo que permite ejecutar en CI o
 * en un contenedor sin dejar el token escrito en disco.
 */
export function readCredentials(): Credentials | null {
  const email = process.env.JIRA_EMAIL?.trim()
  const token = process.env.JIRA_API_TOKEN?.trim()
  if (email && token) return { jiraEmail: email, jiraToken: token }

  const path = credentialsPath()
  if (!existsSync(path)) return null

  try {
    const parsed = schema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function writeCredentials(creds: Credentials): void {
  mkdirSync(configDir(), { recursive: true })

  const path = credentialsPath()
  const tmp = `${path}.tmp`
  writeFileSync(tmp, `${JSON.stringify(creds, null, 2)}\n`, 'utf8')

  // Solo el dueño puede leerlo. En Windows no aplica y chmod es inofensivo.
  try {
    chmodSync(tmp, 0o600)
  } catch {
    /* sistemas sin permisos POSIX */
  }

  renameSync(tmp, path)
}
