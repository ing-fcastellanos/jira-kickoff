export interface Ticket {
  key: string
  projectKey: string
  projectName: string
  summary: string
  status: string
  statusCategory: string
  issueType: string
  priority: string | null
  updated: string
  url: string
}

export interface TicketsResponse {
  tickets: Ticket[]
  fetchedAt: string
  jql: string
}

export interface Branch {
  name: string
  remote: boolean
  local: boolean
}

export type BranchAction =
  | 'reused-worktree'
  | 'checked-out-local'
  | 'tracked-remote'
  | 'created-from-base'

export interface PromptResponse {
  prompt: string
  worktree: string
  maxLength: number
  warnLength: number
}

export interface InitializeResult {
  ticketKey: string
  branch: string
  branchAction: BranchAction
  worktree: string
  worktreeCreated: boolean
  deepLink: string
  launchMode: 'open' | 'clipboard'
  /** The protocol handler accepted the invocation; not that the session opened. */
  launched: boolean
  launchError: string | null
}

export interface TicketComment {
  id: string
  author: string
  avatar: string | null
  at: string
  /** Markdown, converted from the ADF that Jira returns. */
  body: string
}

export interface TicketDetail {
  key: string
  url: string
  summary: string
  status: string
  statusCategory: string
  issueType: string
  priority: string | null
  resolution: string | null
  assignee: { name: string; avatar: string | null } | null
  reporter: { name: string; avatar: string | null } | null
  created: string
  updated: string
  dueDate: string | null
  labels: string[]
  components: string[]
  parent: { key: string; summary: string; url: string } | null
  /** Markdown, converted from the ADF that Jira returns. */
  description: string
  comments: TicketComment[]
}

export interface TicketActivity {
  /** Null when it only appears in the history and there is no worktree left. */
  projectKey: string | null
  worktree: { path: string; branch: string | null; dirty: boolean } | null
  lastInitializedAt: string | null
  lastBranch: string | null
  times: number
}

export interface ActivityResponse {
  byTicket: Record<string, TicketActivity>
  fetchedAt: string
}

export interface WorktreeInfo {
  projectKey: string
  repo: string
  path: string
  name: string
  branch: string | null
  /** Lives inside the configured worktree folder; only these can be deleted. */
  managed: boolean
  isMain: boolean
  dirty: boolean
  unpushed: number
  remoteBranchExists: boolean
  merged: boolean
}

export interface WorktreesResponse {
  worktrees: WorktreeInfo[]
  errors: { projectKey: string; error: string }[]
  /** To label the open button without the UI having to ask for the settings. */
  editorLabel: string
  fetchedAt: string
}

export interface BranchesResponse {
  projectKey: string
  repo: string
  baseBranch: string
  /** Name suggested from the pattern in config.json. */
  suggested: string
  /** Branches that already mention this ticket, in any casing. */
  matches: Branch[]
  branches: Branch[]
  /** If the remote did not answer: the list is local only and this says why. */
  remoteError: string | null
  fetchedAt: string
}
