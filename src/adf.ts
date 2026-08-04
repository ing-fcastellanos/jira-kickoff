/**
 * Converts Atlassian Document Format to Markdown.
 *
 * Jira's v3 API returns descriptions and comments as ADF: a JSON tree, neither
 * text nor HTML. The alternative was to ask for `renderedFields`, which gives
 * Jira's HTML, but painting it would mean injecting foreign HTML into the page.
 * Converting here keeps control of the result and avoids that risk.
 *
 * It covers what these tickets actually use —paragraphs, headings, lists,
 * tables, code blocks, quotes, rules and the code/strong/em/link marks— and
 * degrades gracefully for any node it does not know instead of losing it.
 */

interface AdfNode {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  content?: AdfNode[]
}

/**
 * Escapes what Markdown would interpret. Limited to what actually breaks:
 * an intra-word `_` does not produce emphasis in CommonMark, so `snake_case`
 * survives without littering the text with backslashes.
 */
function escapeText(text: string): string {
  return text.replace(/([\\*[\]<>])/g, '\\$1')
}

function applyMarks(text: string, marks: AdfNode['marks']): string {
  if (!marks?.length) return escapeText(text)

  // Code goes first and unescaped: inside backticks Markdown interprets
  // nothing, and escaping there would show the backslashes.
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
          // An unknown node with children can still contribute its text.
          return inline(n.content)
      }
    })
    .join('')
}

/** The cells of a GFM table have to fit on one line. */
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
  // GFM requires a header row. If the table does not bring one, an empty one is
  // synthesized so that the first row of data is not lost.
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
 * The item's content is generated without indentation and it is its continuation
 * lines that receive it. That way a nested list is indented only once, at the
 * level containing it, and the result stays correct at any depth.
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
    // A panel is a highlighted note; the quote is the closest thing in Markdown.
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
