/**
 * Convierte Atlassian Document Format a Markdown.
 *
 * La API v3 de Jira devuelve las descripciones y los comentarios como ADF: un
 * arbol JSON, ni texto ni HTML. La alternativa era pedir `renderedFields`, que
 * da HTML de Jira, pero pintarlo obligaria a inyectar HTML ajeno en la pagina.
 * Convertir aqui deja el control del resultado y evita ese riesgo.
 *
 * Cubre lo que estos tickets usan de verdad —parrafos, encabezados, listas,
 * tablas, bloques de codigo, citas, reglas y las marcas code/strong/em/link— y
 * degrada con elegancia cualquier nodo que no conozca en vez de perderlo.
 */

interface AdfNode {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  content?: AdfNode[]
}

/**
 * Escapa lo que Markdown interpretaria. Se limita a lo que rompe de verdad:
 * `_` intrapalabra no genera enfasis en CommonMark, asi que `snake_case`
 * sobrevive sin ensuciar el texto con barras invertidas.
 */
function escapeText(text: string): string {
  return text.replace(/([\\*[\]<>])/g, '\\$1')
}

function applyMarks(text: string, marks: AdfNode['marks']): string {
  if (!marks?.length) return escapeText(text)

  // El codigo va primero y sin escapar: dentro de comillas simples Markdown no
  // interpreta nada, y escapar ahi mostraria las barras invertidas.
  const isCode = marks.some((m) => m.type === 'code')
  let out = isCode ? `\`${text.replace(/`/g, '')}\`` : escapeText(text)

  for (const mark of marks) {
    switch (mark.type) {
      case 'strong':
        out = `**${out}**`
        break
      case 'em':
        out = `_${out}_`
        break
      case 'strike':
        out = `~~${out}~~`
        break
      case 'link': {
        const href = typeof mark.attrs?.['href'] === 'string' ? mark.attrs['href'] : ''
        if (href) out = `[${out}](${href})`
        break
      }
      default:
        break
    }
  }
  return out
}

function inline(nodes: AdfNode[] | undefined): string {
  if (!nodes) return ''
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
          return applyMarks(n.text ?? '', n.marks)
        case 'hardBreak':
          return '  \n'
        case 'emoji':
          return String(n.attrs?.['text'] ?? n.attrs?.['shortName'] ?? '')
        case 'mention':
          return String(n.attrs?.['text'] ?? '@?')
        case 'status':
          return `\`${String(n.attrs?.['text'] ?? '')}\``
        case 'date': {
          const ts = Number(n.attrs?.['timestamp'])
          return Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : ''
        }
        case 'inlineCard': {
          const url = String(n.attrs?.['url'] ?? '')
          return url ? `<${url}>` : ''
        }
        default:
          // Un nodo desconocido con hijos todavia puede aportar su texto.
          return inline(n.content)
      }
    })
    .join('')
}

/** Las celdas de una tabla GFM tienen que caber en una linea. */
function cellText(node: AdfNode): string {
  return blocks(node.content).replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim()
}

function table(node: AdfNode): string {
  const rows = (node.content ?? []).filter((r) => r.type === 'tableRow')
  if (rows.length === 0) return ''

  const cells = rows.map((r) => (r.content ?? []).map(cellText))
  const width = Math.max(...cells.map((c) => c.length))
  const pad = (row: string[]): string[] => [...row, ...Array(width - row.length).fill('')]

  const firstIsHeader = (rows[0]?.content ?? []).some((c) => c.type === 'tableHeader')
  // GFM exige fila de encabezado. Si la tabla no la trae, se sintetiza vacia
  // para no perder la primera fila de datos.
  const header = firstIsHeader ? pad(cells[0] ?? []) : Array(width).fill('')
  const body = firstIsHeader ? cells.slice(1) : cells

  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${Array(width).fill('---').join(' | ')} |`,
    ...body.map((r) => `| ${pad(r).join(' | ')} |`),
  ]
  return lines.join('\n')
}

/**
 * El contenido del item se genera sin sangria y son sus lineas de continuacion
 * las que la reciben. Asi una lista anidada se indenta una sola vez, en el nivel
 * que la contiene, y el resultado sigue siendo correcto a cualquier profundidad.
 */
function listBlock(node: AdfNode, ordered: boolean): string {
  const items = (node.content ?? []).filter((i) => i.type === 'listItem')

  return items
    .map((item, i) => {
      const marker = ordered ? `${i + 1}.` : '-'
      const [first, ...rest] = blocks(item.content).split('\n')
      const tail = rest.map((l) => (l.trim() ? `  ${l}` : '')).join('\n')
      return `${marker} ${first ?? ''}${tail ? `\n${tail}` : ''}`
    })
    .join('\n')
}

function block(node: AdfNode): string {
  switch (node.type) {
    case 'paragraph':
      return inline(node.content)
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.['level']) || 1))
      return `${'#'.repeat(level)} ${inline(node.content)}`
    }
    case 'bulletList':
      return listBlock(node, false)
    case 'orderedList':
      return listBlock(node, true)
    case 'codeBlock': {
      const lang = String(node.attrs?.['language'] ?? '')
      const code = (node.content ?? []).map((c) => c.text ?? '').join('')
      return `\`\`\`${lang}\n${code}\n\`\`\``
    }
    // Un panel es una nota destacada; la cita es lo mas parecido en Markdown.
    case 'panel':
    case 'blockquote':
      return blocks(node.content)
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n')
    case 'rule':
      return '---'
    case 'mediaSingle':
    case 'mediaGroup':
      return '_(adjunto no mostrado)_'
    case 'expand':
    case 'nestedExpand': {
      const title = String(node.attrs?.['title'] ?? 'Detalle')
      return `**${title}**\n\n${blocks(node.content)}`
    }
    case 'table':
      return table(node)
    default:
      return blocks(node.content)
  }
}

function blocks(nodes: AdfNode[] | undefined): string {
  if (!nodes) return ''
  return nodes
    .map(block)
    .filter((s) => s.trim() !== '')
    .join('\n\n')
}

export function adfToMarkdown(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return ''
  return blocks((doc as AdfNode).content).trim()
}
