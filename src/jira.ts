/**
 * Cliente minimo de la API REST v3 de Jira Cloud.
 *
 * Usa `/rest/api/3/search/jql`, el endpoint vigente: el viejo `/rest/api/3/search`
 * esta deprecado. Devuelve `{ issues, nextPageToken, isLast }` y pagina por token,
 * no por indice.
 */

export class JiraError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

export interface JiraIssue {
  key: string
  fields: {
    summary: string
    updated: string
    project: { key: string; name: string }
    status: { name: string; statusCategory: { key: string } }
    issuetype: { name: string }
    priority: { name: string } | null
  }
}

export interface JiraCredentials {
  site: string
  email: string
  token: string
}

/**
 * Escapa un valor para interpolarlo en JQL entre comillas dobles.
 * Los nombres de status llevan espacios ("To Do"), asi que citarlos no es opcional.
 */
export function jqlQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * `extraJql` se inserta antes del ORDER BY, que en JQL tiene que ir al final.
 * Se envuelve en parentesis para que un filtro con OR no se cuele en el AND.
 */
export function buildAssignedJql(
  projects: string[],
  statuses: string[],
  extraJql = '',
): string {
  const p = projects.map(jqlQuote).join(', ')
  const s = statuses.map(jqlQuote).join(', ')
  const extra = extraJql.trim() ? ` AND (${extraJql.trim()})` : ''
  return `assignee = currentUser() AND project IN (${p}) AND status IN (${s})${extra} ORDER BY updated DESC`
}

const FIELDS = ['summary', 'status', 'issuetype', 'priority', 'updated', 'project']

/** Tope de paginas por consulta. Si se alcanza es que la JQL esta mal, no que hay tanto trabajo. */
const MAX_PAGES = 10

export class JiraClient {
  private readonly auth: string

  constructor(private readonly creds: JiraCredentials) {
    this.auth = Buffer.from(`${creds.email}:${creds.token}`).toString('base64')
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${this.creds.site}${path}`, {
        ...init,
        headers: {
          Authorization: `Basic ${this.auth}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      })
    } catch (err) {
      throw new JiraError(`No pude alcanzar ${this.creds.site}: ${(err as Error).message}`)
    }

    if (res.status === 401) {
      throw new JiraError('Jira rechazo las credenciales. Revisa JIRA_EMAIL y JIRA_API_TOKEN.', 401)
    }
    if (!res.ok) {
      const body = await res.text()
      throw new JiraError(extractJiraMessage(body) ?? `Jira respondio ${res.status}`, res.status)
    }

    return (await res.json()) as T
  }

  async myself(): Promise<{ accountId: string; displayName: string; emailAddress?: string }> {
    return this.request('/rest/api/3/myself')
  }

  async search(jql: string): Promise<JiraIssue[]> {
    const issues: JiraIssue[] = []
    let nextPageToken: string | undefined

    for (let page = 0; page < MAX_PAGES; page++) {
      const body: Record<string, unknown> = { jql, fields: FIELDS, maxResults: 100 }
      if (nextPageToken) body['nextPageToken'] = nextPageToken

      const res = await this.request<{
        issues: JiraIssue[]
        nextPageToken?: string
        isLast?: boolean
      }>('/rest/api/3/search/jql', { method: 'POST', body: JSON.stringify(body) })

      issues.push(...res.issues)
      if (res.isLast !== false || !res.nextPageToken) break
      nextPageToken = res.nextPageToken
    }

    return issues
  }
}

/** Jira devuelve los errores en `errorMessages[]`; el texto crudo es ruido. */
function extractJiraMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { errorMessages?: string[] }
    const first = parsed.errorMessages?.[0]
    return first ?? null
  } catch {
    return null
  }
}
