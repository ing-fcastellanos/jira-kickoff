export interface ProjectHealth {
  key: string
  repo: string
  baseBranch: string
  enabled: boolean
  repoExists: boolean
  isGitRepo: boolean
}

export type PermissionMode =
  | 'inherit'
  | 'default'
  | 'plan'
  | 'acceptEdits'
  | 'auto'
  | 'bypassPermissions'

export interface PromptSettings {
  base: string
  additions: string[]
}

export interface ProjectSettings {
  repo: string
  baseBranch: string
  enabled: boolean
  prompt?: Partial<PromptSettings>
}

export interface FileConfig {
  server: { port: number }
  jira: { site: string; statuses: string[]; extraJql: string }
  worktrees: { dir: string; alignOriginHead: boolean }
  branch: { pattern: string; slugMaxLength: number }
  launch: { mode: 'open' | 'clipboard'; permissionMode: PermissionMode }
  editor: { label: string; command: string; args: string[] }
  prompt: PromptSettings
  projects: Record<string, ProjectSettings>
}

export interface Placeholder {
  token: string
  description: string
}

export interface SettingsResponse {
  config: FileConfig
  placeholders: Placeholder[]
  branchPlaceholders: Placeholder[]
  promptLimits: { max: number; warn: number }
  credentials: { configured: boolean; email: string | null }
}

export interface Health {
  ok: boolean
  problems: string[]
  jira: { site: string; credentialsConfigured: boolean; email: string | null }
  git: { available: boolean; version: string | null }
  projects: ProjectHealth[]
}

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
  launched: boolean
  launchError: string | null
}

export interface TicketComment {
  id: string
  author: string
  avatar: string | null
  at: string
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
  description: string
  comments: TicketComment[]
}

export interface TicketActivity {
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
  editorLabel: string
  fetchedAt: string
}

export interface BranchesResponse {
  projectKey: string
  repo: string
  baseBranch: string
  suggested: string
  matches: Branch[]
  branches: Branch[]
  remoteError: string | null
  fetchedAt: string
}
