/**
 * Combining diacritical marks that NFD separates from their base letter.
 * Declared with escapes instead of the literal characters: they are invisible in
 * an editor and any re-encoding of the file corrupts them silently.
 */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g')

/**
 * Turns free text into a fragment usable inside a branch name.
 *
 * The marks are stripped before collapsing non-alphanumerics: otherwise
 * "Anadir" with a tilde would go through NFD to letter + loose tilde, and that
 * tilde would end up turned into a dash ("an-adir").
 *
 * It cuts at a word boundary: `...override-pric` reads worse than `...override`.
 */
export function slugify(text: string, maxLength: number): string {
  const base = text
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (base.length <= maxLength) return base

  const cut = base.slice(0, maxLength)
  const lastDash = cut.lastIndexOf('-')
  // If the first word already exceeds the limit there is no useful boundary.
  return (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '')
}

export interface BranchNameInput {
  pattern: string
  ticketKey: string
  summary: string
  slugMaxLength: number
}

export function suggestBranchName({
  pattern,
  ticketKey,
  summary,
  slugMaxLength,
}: BranchNameInput): string {
  const replacements: Record<string, string> = {
    '{{ticket}}': ticketKey,
    '{{ticket-lower}}': ticketKey.toLowerCase(),
    '{{slug}}': slugify(summary, slugMaxLength),
  }

  let out = pattern
  for (const [token, value] of Object.entries(replacements)) {
    out = out.replaceAll(token, value)
  }
  // An empty summary would leave a `-` dangling at the end of the pattern.
  return out.replace(/-+$/, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Detects whether a branch belongs to a ticket.
 * Requires that no digit follows, so that ABC-123 does not claim `abc-1230`.
 */
export function matchesTicket(branchName: string, ticketKey: string): boolean {
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(ticketKey)}([^0-9]|$)`, 'i')
  return re.test(branchName)
}
