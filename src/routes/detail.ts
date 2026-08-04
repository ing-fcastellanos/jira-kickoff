import type { FastifyPluginAsync } from 'fastify'
import type { ConfigStore } from '../config'
import { JiraClient } from '../jira'
import type { JiraIssueDetail } from '../jira'
import { MissingCredentialsError } from '../ticket-service'
import type { TicketComment, TicketDetail } from '../types'
import { adfToMarkdown } from '../adf'
import { replyWithError } from './errors'

/** Jira returns several avatar sizes; 24 px is enough for a list. */
function avatarOf(user: { avatarUrls?: Record<string, string> } | null | undefined): string | null {
  return user?.avatarUrls?.['24x24'] ?? user?.avatarUrls?.['48x48'] ?? null
}

function personOf(
  user: { displayName?: string; avatarUrls?: Record<string, string> } | null | undefined,
) {
  if (!user?.displayName) return null
  return { name: user.displayName, avatar: avatarOf(user) }
}

function toDetail(issue: JiraIssueDetail, site: string): TicketDetail {
  const f = issue.fields

  const comments: TicketComment[] = (f.comment?.comments ?? []).map((c) => ({
    id: c.id,
    author: c.author?.displayName ?? 'Desconocido',
    avatar: avatarOf(c.author),
    at: c.created,
    body: adfToMarkdown(c.body),
  }))

  return {
    key: issue.key,
    url: `${site}/browse/${issue.key}`,
    summary: f.summary,
    status: f.status.name,
    statusCategory: f.status.statusCategory.key,
    issueType: f.issuetype.name,
    priority: f.priority?.name ?? null,
    resolution: f.resolution?.name ?? null,
    assignee: personOf(f.assignee),
    reporter: personOf(f.reporter),
    created: f.created,
    updated: f.updated,
    dueDate: f.duedate,
    labels: f.labels ?? [],
    components: (f.components ?? []).map((c) => c.name),
    parent: f.parent
      ? {
          key: f.parent.key,
          summary: f.parent.fields?.summary ?? '',
          url: `${site}/browse/${f.parent.key}`,
        }
      : null,
    description: adfToMarkdown(f.description),
    comments,
  }
}

export const detailRoutes: FastifyPluginAsync<{ store: ConfigStore }> = async (app, opts) => {
  const { store } = opts

  app.get<{ Params: { ticketKey: string } }>('/api/tickets/:ticketKey', async (req, reply) => {
    const config = store.get()
    if (!config.jiraEmail || !config.jiraToken) {
      return replyWithError(reply, new MissingCredentialsError())
    }

    const client = new JiraClient({
      site: config.jira.site,
      email: config.jiraEmail,
      token: config.jiraToken,
    })

    try {
      // Always requested fresh: the detail is opened to read the latest on the
      // ticket, which is exactly what a list cache cannot guarantee.
      const issue = await client.issue(req.params.ticketKey.toUpperCase())
      return toDetail(issue, config.jira.site)
    } catch (err) {
      return replyWithError(reply, err)
    }
  })
}
