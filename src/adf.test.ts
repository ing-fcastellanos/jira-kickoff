import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { adfToMarkdown } from './adf'

const doc = (...content: unknown[]) => ({ type: 'doc', version: 1, content })
const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const t = (text: string, marks?: unknown[]) => ({ type: 'text', text, marks })

describe('adfToMarkdown', () => {
  it('devuelve cadena vacia si no hay documento', () => {
    assert.equal(adfToMarkdown(null), '')
    assert.equal(adfToMarkdown(undefined), '')
    assert.equal(adfToMarkdown(doc()), '')
  })

  it('separa bloques con linea en blanco', () => {
    assert.equal(adfToMarkdown(doc(p(t('uno')), p(t('dos')))), 'uno\n\ndos')
  })

  it('aplica las marcas', () => {
    const d = doc(
      p(
        t('normal '),
        t('fuerte', [{ type: 'strong' }]),
        t(' '),
        t('enfasis', [{ type: 'em' }]),
        t(' '),
        t('codigo', [{ type: 'code' }]),
      ),
    )
    assert.equal(adfToMarkdown(d), 'normal **fuerte** _enfasis_ `codigo`')
  })

  it('no escapa dentro de codigo', () => {
    const d = doc(p(t('a[0] * b', [{ type: 'code' }])))
    assert.equal(adfToMarkdown(d), '`a[0] * b`')
  })

  it('escapa lo que Markdown interpretaria, pero deja el guion bajo', () => {
    const d = doc(p(t('total * 2 [ver] snake_case <tag>')))
    assert.equal(adfToMarkdown(d), 'total \\* 2 \\[ver\\] snake_case \\<tag\\>')
  })

  it('convierte enlaces', () => {
    const d = doc(p(t('la guia', [{ type: 'link', attrs: { href: 'https://ej.com/a' } }])))
    assert.equal(adfToMarkdown(d), '[la guia](https://ej.com/a)')
  })

  it('convierte encabezados y acota el nivel', () => {
    assert.equal(adfToMarkdown(doc({ type: 'heading', attrs: { level: 2 }, content: [t('X')] })), '## X')
    assert.equal(adfToMarkdown(doc({ type: 'heading', attrs: { level: 9 }, content: [t('X')] })), '###### X')
  })

  it('convierte bloques de codigo con lenguaje', () => {
    const d = doc({
      type: 'codeBlock',
      attrs: { language: 'sql' },
      content: [{ type: 'text', text: 'SELECT 1;' }],
    })
    assert.equal(adfToMarkdown(d), '```sql\nSELECT 1;\n```')
  })

  it('convierte listas', () => {
    const li = (text: string) => ({ type: 'listItem', content: [p(t(text))] })
    assert.equal(
      adfToMarkdown(doc({ type: 'bulletList', content: [li('uno'), li('dos')] })),
      '- uno\n- dos',
    )
    assert.equal(
      adfToMarkdown(doc({ type: 'orderedList', content: [li('uno'), li('dos')] })),
      '1. uno\n2. dos',
    )
  })

  it('indenta las listas anidadas', () => {
    const inner = { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('hijo'))] }] }
    const outer = {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [p(t('padre')), inner] }],
    }
    assert.equal(adfToMarkdown(doc(outer)), '- padre\n\n  - hijo')
  })

  it('convierte tablas con encabezado', () => {
    const cell = (type: string, text: string) => ({ type, content: [p(t(text))] })
    const d = doc({
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('tableHeader', 'A'), cell('tableHeader', 'B')] },
        { type: 'tableRow', content: [cell('tableCell', '1'), cell('tableCell', '2')] },
      ],
    })
    assert.equal(adfToMarkdown(d), '| A | B |\n| --- | --- |\n| 1 | 2 |')
  })

  it('sintetiza encabezado cuando la tabla no lo trae, sin perder la fila', () => {
    const cell = (text: string) => ({ type: 'tableCell', content: [p(t(text))] })
    const d = doc({
      type: 'table',
      content: [{ type: 'tableRow', content: [cell('1'), cell('2')] }],
    })
    assert.equal(adfToMarkdown(d), '|  |  |\n| --- | --- |\n| 1 | 2 |')
  })

  it('escapa las barras verticales dentro de una celda', () => {
    const d = doc({
      type: 'table',
      content: [
        { type: 'tableRow', content: [{ type: 'tableCell', content: [p(t('a|b'))] }] },
      ],
    })
    assert.ok(adfToMarkdown(d).includes('a\\|b'))
  })

  it('convierte citas y reglas', () => {
    assert.equal(adfToMarkdown(doc({ type: 'blockquote', content: [p(t('eso'))] })), '> eso')
    assert.equal(adfToMarkdown(doc({ type: 'rule' })), '---')
  })

  it('rescata el texto de un nodo desconocido en vez de perderlo', () => {
    const d = doc({ type: 'somethingNew', content: [p(t('sigo aqui'))] })
    assert.equal(adfToMarkdown(d), 'sigo aqui')
  })

  it('resuelve menciones y fechas', () => {
    assert.equal(adfToMarkdown(doc(p({ type: 'mention', attrs: { text: '@Ana' } }))), '@Ana')
    assert.equal(
      adfToMarkdown(doc(p({ type: 'date', attrs: { timestamp: '1751328000000' } }))),
      '2025-07-01',
    )
  })
})
