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
 * Jira credentials.
 *
 * Environment variables win over the file: that is what makes it possible to run
 * in CI or in a container without leaving the token written on disk.
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

  // Only the owner can read it. On Windows it does not apply and chmod is harmless.
  try {
    chmodSync(tmp, 0o600)
  } catch {
    /* systems without POSIX permissions */
  }

  renameSync(tmp, path)
}
