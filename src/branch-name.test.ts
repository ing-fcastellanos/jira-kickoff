import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { matchesTicket, slugify, suggestBranchName } from './branch-name'

describe('slugify', () => {
  it('normaliza a minusculas y guiones', () => {
    assert.equal(
      slugify('Ability for a PO to Override Pricing', 60),
      'ability-for-a-po-to-override-pricing',
    )
  })

  it('quita acentos sin dejar guiones en su lugar', () => {
    assert.equal(slugify('Añadir validación de correo', 60), 'anadir-validacion-de-correo')
  })

  it('colapsa signos y recorta los extremos', () => {
    assert.equal(slugify('  ¡Pago — "urgente"!  ', 60), 'pago-urgente')
  })

  it('corta en frontera de palabra', () => {
    // 'email-logins-remove' is 19 characters; 'case' does not fit whole in 22.
    assert.equal(slugify('Email logins remove case sensitive', 22), 'email-logins-remove')
  })

  it('corta a la fuerza si la primera palabra excede el limite', () => {
    assert.equal(slugify('Supercalifragilistico', 10), 'supercalif')
  })

  it('devuelve cadena vacia si no queda nada utilizable', () => {
    assert.equal(slugify('¿¡—!?', 20), '')
  })
})

describe('suggestBranchName', () => {
  const pattern = 'feature/{{ticket-lower}}-{{slug}}'

  it('aplica el patron completo', () => {
    // 36 characters of slug: below the limit, so it is not trimmed.
    assert.equal(
      suggestBranchName({
        pattern,
        ticketKey: 'ABC-123',
        summary: 'Ability for a PO to Override Pricing',
        slugMaxLength: 40,
      }),
      'feature/abc-123-ability-for-a-po-to-override-pricing',
    )
  })

  it('recorta el slug largo sin tocar el prefijo', () => {
    assert.equal(
      suggestBranchName({
        pattern,
        ticketKey: 'ABC-456',
        summary: 'Admin payouts pagination was archived as done but never implemented',
        slugMaxLength: 40,
      }),
      // 'archived' cabe justo en 40; 'as' ya no.
      'feature/abc-456-admin-payouts-pagination-was-archived',
    )
  })

  it('no deja guion colgando cuando el summary no aporta slug', () => {
    assert.equal(
      suggestBranchName({ pattern, ticketKey: 'XY-1', summary: '???', slugMaxLength: 40 }),
      'feature/xy-1',
    )
  })

  it('soporta {{ticket}} en mayusculas', () => {
    assert.equal(
      suggestBranchName({
        pattern: 'user/{{ticket}}',
        ticketKey: 'XYZ-242',
        summary: 'x',
        slugMaxLength: 40,
      }),
      'user/XYZ-242',
    )
  })
})

describe('matchesTicket', () => {
  it('reconoce los patrones habituales de nombre de rama', () => {
    assert.ok(matchesTicket('feature/abc-699-cleaning-spend-fix', 'ABC-699'))
    assert.ok(matchesTicket('feature/ABC-84', 'ABC-84'))
    assert.ok(matchesTicket('user/explore-abc-764-907679', 'ABC-764'))
  })

  it('ignora mayusculas', () => {
    assert.ok(matchesTicket('FEATURE/ABC-123-algo', 'abc-123'))
  })

  it('no confunde un ticket con otro que lo prefija', () => {
    assert.ok(!matchesTicket('feature/abc-1230-otra-cosa', 'ABC-123'))
    assert.ok(!matchesTicket('feature/abc-12', 'ABC-123'))
  })

  it('no reclama una rama de otro proyecto', () => {
    assert.ok(!matchesTicket('feature/xyz-123-algo', 'ABC-123'))
  })

  it('exige frontera por la izquierda', () => {
    assert.ok(!matchesTicket('feature/xabc-123', 'ABC-123'))
  })
})
