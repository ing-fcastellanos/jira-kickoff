import type { PromptConfig } from './config'
import type { Ticket } from './types'

export interface PromptContext {
  ticket: Ticket
  branch: string
  repo: string
  worktree: string
}

/**
 * El handler de la app trunca `q` a 16 KiB menos 2 KiB de holgura.
 * Valor leido del binario (`1024*16 - 2*1024`), no estimado.
 */
export const PROMPT_MAX_LENGTH = 14_336

/**
 * Por debajo de esto no hay riesgo. Por encima, el URL-encoding puede acercar la
 * linea de comandos de Windows a su tope de 32 767 caracteres, asi que la UI avisa.
 */
export const PROMPT_WARN_LENGTH = 8_000

/**
 * Tope del deep link ya codificado. La URL viaja como argumento de linea de
 * comandos de Windows, cuyo limite duro son 32 767 caracteres. El URL-encoding
 * puede triplicar el tamano del prompt, asi que un prompt valido para la app
 * (14 336) todavia puede generar una URL impasable. Se corta antes con holgura.
 */
export const URL_SAFE_LENGTH = 30_000

function render(template: string, ctx: PromptContext): string {
  const values: Record<string, string> = {
    '{{ticket}}': ctx.ticket.key,
    '{{summary}}': ctx.ticket.summary,
    '{{url}}': ctx.ticket.url,
    '{{branch}}': ctx.branch,
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
 * Base y adiciones, en ese orden. Las adiciones vacias se descartan para que
 * comentar una linea en config.json no deje un hueco en el prompt.
 */
export function composePrompt(config: PromptConfig, ctx: PromptContext): string {
  const base = render(config.base, ctx).trim()
  const additions = config.additions.map((a) => render(a, ctx).trim()).filter(Boolean)

  if (additions.length === 0) return base
  return `${base}\n\n${additions.join('\n')}`
}
