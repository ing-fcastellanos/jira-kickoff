/**
 * Minimal client for Jira Cloud's REST v3 API.
 *
 * Uses `/rest/api/3/search/jql`, the current endpoint: the old
 * `/rest/api/3/search` is deprecated. It returns
 * `{ issues, nextPageToken, isLast }` and pages by token, not by index.
 */

import { LocalizedError, RawError, type MessageKey, type Vars } from './messages'

export class JiraError extends LocalizedError {
  constructor(key: MessageKey, vars?: Vars, httpStatus = 502) {
    super(key, vars, httpStatus)
  }
}

/** The text is written by Jira, so it is shown verbatim. */
export class JiraPlainError extends RawError {}

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

interface JiraUser {
  displayName?: string
  emailAddress?: string
  avatarUrls?: Record<string, string>
}

export interface JiraIssueDetail {
  key: string
  fields: {
    summary: string
    created: string
    updated: string
    duedate: string | null
    description: unknown
    status: { name: string; statusCategory: { key: string } }
    issuetype: { name: string }
    priority: { name: string } | null
    resolution: { name: string } | null
    assignee: JiraUser | null
    reporter: JiraUser | null
    labels: string[]
    components: { name: string }[]
    parent?: { key: string; fields?: { summary?: string } }
    comment?: {
      total?: number
      comments?: { id: string; author?: JiraUser; created: string; body: unknown }[]
    }
  }
}

/**
 * A move the workflow allows from the ticket's current status. `to` is where it
 * would leave it, which is the only part that means the same in every project.
 */
export interface JiraTransition {
  id: string
  name: string
  to: { name: string }
}

export interface JiraCredentials {
  site: string
  email: string
  token: string
}

/** Two status names are the same one. Jira is not case sensitive about them either. */
export function sameStatus(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * The transition that lands on `status`, or null if the workflow does not offer
 * one from where the ticket is.
 *
 * It is matched by destination and not by the transition's own name: a project
 * can call the move "Start", "Empezar" or "MAID-42", but where it leaves the
 * ticket is not a matter of taste. Picking by name would also happily fire a
 * transition called "In Progress" that lands somewhere else entirely.
 */
export function pickTransition(
  transitions: JiraTransition[],
  status: string,
): JiraTransition | null {
  return transitions.find((tr) => tr.to?.name && sameStatus(tr.to.name, status)) ?? null
}

/**
 * Escapes a value so it can be interpolated into JQL between double quotes.
 * Status names contain spaces ("To Do"), so quoting them is not optional.
 */
export function jqlQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * `extraJql` is inserted before the ORDER BY, which in JQL has to come last.
 * It is wrapped in parentheses so that a filter with an OR does not leak into
 * the AND.
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

/** Page cap per query. Hitting it means the JQL is wrong, not that there is that much work. */
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
      throw new JiraError('err.unreachable', {
        site: this.creds.site,
        detail: (err as Error).message,
      })
    }

    if (res.status === 401) {
      // Neutral on purpose: the same error is seen in the wizard, where the user
      // has just typed the details, and in the already configured panel.
      throw new JiraError('err.credentials', undefined, 401)
    }
    if (!res.ok) {
      // If Jira explains the failure, its text wins: it is more concrete than
      // anything we could say here, even if it arrives in another language.
      const detail = extractJiraMessage(await res.text())
      if (detail) throw new JiraPlainError(detail, res.status)
      throw new JiraError('err.jiraStatus', { status: res.status }, res.status)
    }

    // A transition answers 204 with an empty body: parsing it as JSON would turn
    // a success into an exception.
    if (res.status === 204) return undefined as T

    return (await res.json()) as T
  }

  async myself(): Promise<{ accountId: string; displayName: string; emailAddress?: string }> {
    return this.request('/rest/api/3/myself')
  }

  /** Full record of a ticket. The description and the comments arrive as ADF. */
  async issue(key: string): Promise<JiraIssueDetail> {
    const fields = [
      'summary',
      'status',
      'issuetype',
      'priority',
      'assignee',
      'reporter',
      'created',
      'updated',
      'duedate',
      'resolution',
      'labels',
      'components',
      'parent',
      'description',
      'comment',
    ].join(',')
    return this.request(`/rest/api/3/issue/${encodeURIComponent(key)}?fields=${fields}`)
  }

  /** Just the status, for when the cached ticket is not enough to decide. */
  async status(key: string): Promise<string> {
    const issue = await this.request<{ fields: { status: { name: string } } }>(
      `/rest/api/3/issue/${encodeURIComponent(key)}?fields=status`,
    )
    return issue.fields.status.name
  }

  /** What the workflow allows from where the ticket is right now, not every transition. */
  async transitions(key: string): Promise<JiraTransition[]> {
    const res = await this.request<{ transitions?: JiraTransition[] }>(
      `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`,
    )
    return res.transitions ?? []
  }

  async transition(key: string, transitionId: string): Promise<void> {
    await this.request(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ transition: { id: transitionId } }),
    })
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

/** Jira returns errors in `errorMessages[]`; the raw text is noise. */
function extractJiraMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { errorMessages?: string[] }
    const first = parsed.errorMessages?.[0]
    return first ?? null
  } catch {
    return null
  }
}
