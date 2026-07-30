import type { AppConfig, ConfigStore } from './config'
import { enabledProjectKeys } from './config'
import { JiraClient, buildAssignedJql, type JiraIssue } from './jira'
import type { Ticket, TicketsResponse } from './types'

/** Jira no cambia entre dos pulsaciones de F5; sin esto cada render golpea la API. */
const CACHE_TTL_MS = 30_000

export class MissingCredentialsError extends Error {
  constructor() {
    super('Faltan JIRA_EMAIL o JIRA_API_TOKEN en .env')
  }
}

export class NoProjectsEnabledError extends Error {
  constructor() {
    super('No hay ningun proyecto activo. Activa alguno en Opciones.')
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
 * Fuente unica de los tickets. La comparten la ruta de tickets y la de ramas,
 * que necesita el summary para proponer el nombre.
 */
export class TicketService {
  private cache: { at: number; payload: TicketsResponse } | null = null

  constructor(private readonly store: ConfigStore) {
    // Cambiar de proyectos, de statuses o de filtro invalida lo cacheado:
    // seguir sirviendolo mostraria el resultado de la configuracion anterior.
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

  /** Un ticket ausente de la cache puede haberse asignado hace un segundo: se reintenta fresco. */
  async find(key: string): Promise<Ticket | null> {
    const wanted = key.toUpperCase()
    const fromCache = (await this.list()).tickets.find((t) => t.key.toUpperCase() === wanted)
    if (fromCache) return fromCache

    if (!this.cache || Date.now() - this.cache.at < 1_000) return null
    const refreshed = await this.list(true)
    return refreshed.tickets.find((t) => t.key.toUpperCase() === wanted) ?? null
  }
}
