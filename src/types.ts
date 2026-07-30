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
