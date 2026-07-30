/**
 * Marcas diacriticas combinantes que NFD separa de su letra base.
 * Se declara con escapes en vez de los caracteres literales: son invisibles en
 * un editor y cualquier reencoding del archivo los corrompe en silencio.
 */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g')

/**
 * Convierte un texto libre en un fragmento usable dentro de un nombre de rama.
 *
 * Las marcas se quitan antes de colapsar lo no alfanumerico: si no, "Anadir"
 * con tilde pasaria por NFD a letra + tilde suelta, y esa tilde terminaria
 * convertida en un guion ("an-adir").
 *
 * Corta en frontera de palabra: `...override-pric` se lee peor que `...override`.
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
  // Si la primera palabra ya excede el limite no hay frontera util donde cortar.
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
  // Un summary vacio dejaria un `-` colgando al final del patron.
  return out.replace(/-+$/, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Detecta si una rama corresponde a un ticket.
 * Exige que no siga un digito, para que ABC-123 no reclame `abc-1230`.
 */
export function matchesTicket(branchName: string, ticketKey: string): boolean {
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(ticketKey)}([^0-9]|$)`, 'i')
  return re.test(branchName)
}
