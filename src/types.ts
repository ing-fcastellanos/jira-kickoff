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
  /** El handler de protocolos acepto la invocacion; no que la sesion se haya abierto. */
  launched: boolean
  launchError: string | null
}

export interface TicketComment {
  id: string
  author: string
  avatar: string | null
  at: string
  /** Markdown, convertido desde el ADF que devuelve Jira. */
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
  /** Markdown, convertido desde el ADF que devuelve Jira. */
  description: string
  comments: TicketComment[]
}

export interface TicketActivity {
  /** Nulo cuando solo consta en el historial y ya no hay worktree. */
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
  /** Vive dentro de la carpeta de worktrees configurada; solo estos se pueden borrar. */
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
  /** Para rotular el boton de abrir sin que la UI tenga que pedir los settings. */
  editorLabel: string
  fetchedAt: string
}

export interface BranchesResponse {
  projectKey: string
  repo: string
  baseBranch: string
  /** Nombre propuesto a partir del patron de config.json. */
  suggested: string
  /** Ramas que ya mencionan este ticket, en cualquier mayuscula. */
  matches: Branch[]
  branches: Branch[]
  /** Si el remoto no respondio: la lista es solo local y esto explica por que. */
  remoteError: string | null
  fetchedAt: string
}
