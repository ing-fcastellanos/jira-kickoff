import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { buildAssignedJql, jqlQuote, pickTransition, sameStatus, type JiraTransition } from './jira'

const tr = (id: string, name: string, to: string): JiraTransition => ({ id, name, to: { name: to } })

test('jqlQuote escapes quotes and backslashes', () => {
  assert.equal(jqlQuote('To Do'), '"To Do"')
  assert.equal(jqlQuote('say "hi"'), '"say \\"hi\\""')
})

test('buildAssignedJql puts the extra filter before the ORDER BY', () => {
  const jql = buildAssignedJql(['CP'], ['To Do'], 'sprint in openSprints()')
  assert.match(jql, /AND \(sprint in openSprints\(\)\) ORDER BY updated DESC$/)
})

test('sameStatus ignores casing and surrounding spaces', () => {
  assert.ok(sameStatus('In Progress', ' in progress '))
  assert.ok(!sameStatus('In Progress', 'In Review'))
})

/*
 * Matched by destination: what a project calls the move is its business, where
 * it leaves the ticket is not.
 */
test('picks the transition by the status it lands on, not by its name', () => {
  const transitions = [tr('11', 'Start', 'In Progress'), tr('21', 'In Progress', 'Blocked')]
  assert.equal(pickTransition(transitions, 'In Progress')?.id, '11')
})

test('the target status is matched without casing', () => {
  assert.equal(pickTransition([tr('31', 'Empezar', 'in progress')], 'In Progress')?.id, '31')
})

test('no transition leads there', () => {
  assert.equal(pickTransition([tr('41', 'Done', 'Done')], 'In Progress'), null)
})

test('a transition with no destination does not crash the search', () => {
  const broken = { id: '51', name: 'Weird' } as JiraTransition
  assert.equal(pickTransition([broken, tr('52', 'Start', 'In Progress')], 'In Progress')?.id, '52')
})
