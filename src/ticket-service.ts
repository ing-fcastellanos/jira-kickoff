import type { AppConfig, ConfigStore } from './config'
import { enabledProjectKeys } from './config'
import { JiraClient, buildAssignedJql, pickTransition, sameStatus, type JiraIssue } from './jira'
import type { Ticket, TicketTransition, TicketsResponse } from './types'
import { LocalizedError } from './messages'

/** Jira does not change between two F5s; without this every render hits the API. */
const CACHE_TTL_MS = 30_000

export class MissingCredentialsError extends LocalizedError {
  constructor() {
    super('err.missingCredentials', undefined, 503)
  }
}

export class NoProjectsEnabledError extends LocalizedError {
  constructor() {
    super('err.noProjects', undefined, 400)
  }
}

function toTicket(issue: JiraIssue, site: string): Ticket {
  const f = issue.fields
  return {
    key: issue.key,
    projectKey: f.project.key,
    projectName: f.project.name,
    summary: f.summary,
    status: f.status.name,
    statusCategory: f.status.statusCategory.key,
    issueType: f.issuetype.name,
    priority: f.priority?.name ?? null,
    updated: f.updated,
    url: `${site}/browse/${issue.key}`,
  }
}

/**
 * Single source of the tickets. Shared by the tickets route and the branches
 * one, which needs the summary to suggest the name.
 */
export class TicketService {
  private cache: { at: number; payload: TicketsResponse } | null = null

  constructor(private readonly store: ConfigStore) {
    // Changing projects, statuses or filter invalidates what is cached: serving
    // it on would show the result of the previous configuration.
    store.subscribe(() => {
      this.cache = null
    })
  }

  private get config(): AppConfig {
    return this.store.get()
  }

  get jql(): string {
    const config = this.config
    return buildAssignedJql(enabledProjectKeys(config), config.jira.statuses, config.jira.extraJql)
  }

  private client(): JiraClient {
    const config = this.config
    if (!config.jiraEmail || !config.jiraToken) throw new MissingCredentialsError()
    return new JiraClient({
      site: config.jira.site,
      email: config.jiraEmail,
      token: config.jiraToken,
    })
  }

  async list(fresh = false): Promise<TicketsResponse> {
    if (!fresh && this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.payload
    }

    if (enabledProjectKeys(this.config).length === 0) throw new NoProjectsEnabledError()

    const jql = this.jql
    const issues = await this.client().search(jql)
    const payload: TicketsResponse = {
      tickets: issues.map((i) => toTicket(i, this.config.jira.site)),
      fetchedAt: new Date().toISOString(),
      jql,
    }
    this.cache = { at: Date.now(), payload }
    return payload
  }

  /**
   * Moves the ticket to `status`, and says what happened.
   *
   * The cached status is not trusted to decide: it can be half a minute old and
   * the ticket may have been moved from Jira in the meantime. The cheap check
   * comes first anyway, so the common case —a ticket sitting in To Do— costs the
   * two calls it needs and not three.
   *
   * Errors are not swallowed here: the caller is the one that knows whether a
   * failure should abort anything, and only the HTTP edge can translate them.
   */
  async moveTo(ticket: Ticket, status: string): Promise<TicketTransition> {
    const to = status.trim()
    const outcome = (
      result: TicketTransition['outcome'],
      from = ticket.status,
    ): TicketTransition => ({ from, to, outcome: result })

    if (!to) return outcome('disabled')
    if (sameStatus(ticket.status, to)) return outcome('already')

    const client = this.client()
    const chosen = pickTransition(await client.transitions(ticket.key), to)

    // No transition to that status can mean two things, and they read very
    // differently: the ticket is already there —the list was stale— or the
    // workflow simply does not go that way from where it is.
    if (!chosen) {
      const live = await client.status(ticket.key)
      return sameStatus(live, to) ? outcome('already', live) : outcome('unavailable', live)
    }

    await client.transition(ticket.key, chosen.id)
    // The list would keep serving the old status for the rest of the TTL.
    this.cache = null
    return outcome('moved')
  }

  /** A ticket missing from the cache may have been assigned a second ago: retried fresh. */
  async find(key: string): Promise<Ticket | null> {
    const wanted = key.toUpperCase()
    const fromCache = (await this.list()).tickets.find((t) => t.key.toUpperCase() === wanted)
    if (fromCache) return fromCache

    if (!this.cache || Date.now() - this.cache.at < 1_000) return null
    const refreshed = await this.list(true)
    return refreshed.tickets.find((t) => t.key.toUpperCase() === wanted) ?? null
  }
}
