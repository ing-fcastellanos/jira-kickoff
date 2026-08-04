import type { PromptConfig } from './config'
import type { Ticket } from './types'

export interface PromptContext {
  ticket: Ticket
  branch: string
  baseBranch: string
  repo: string
  worktree: string
}

/**
 * The app's handler truncates `q` at 16 KiB minus 2 KiB of slack.
 * Value read from the binary (`1024*16 - 2*1024`), not estimated.
 */
export const PROMPT_MAX_LENGTH = 14_336

/**
 * Below this there is no risk. Above it, URL-encoding can push the Windows
 * command line towards its 32,767-character cap, so the UI warns.
 */
export const PROMPT_WARN_LENGTH = 8_000

/**
 * Cap for the already-encoded deep link. The URL travels as a Windows command
 * line argument, whose hard limit is 32,767 characters. URL-encoding can triple
 * the size of the prompt, so a prompt that is valid for the app (14,336) can
 * still produce an unpassable URL. It is cut earlier, with slack.
 */
export const URL_SAFE_LENGTH = 30_000

function render(template: string, ctx: PromptContext): string {
  const values: Record<string, string> = {
    '{{ticket}}': ctx.ticket.key,
    '{{summary}}': ctx.ticket.summary,
    '{{url}}': ctx.ticket.url,
    '{{branch}}': ctx.branch,
    '{{baseBranch}}': ctx.baseBranch,
    '{{repo}}': ctx.repo,
    '{{worktree}}': ctx.worktree,
  }
  let out = template
  for (const [token, value] of Object.entries(values)) {
    out = out.replaceAll(token, value)
  }
  return out
}

/**
 * Base and additions, in that order. Empty additions are discarded so that
 * commenting out a line in config.json does not leave a gap in the prompt.
 */
export function composePrompt(config: PromptConfig, ctx: PromptContext): string {
  const base = render(config.base, ctx).trim()
  const additions = config.additions.map((a) => render(a, ctx).trim()).filter(Boolean)

  if (additions.length === 0) return base
  return `${base}\n\n${additions.join('\n')}`
}
