import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parseWorktreeList } from './worktree'

test('reads the path and the short branch name of every worktree', () => {
  const entries = parseWorktreeList(
    [
      'worktree /repo',
      'HEAD abc123',
      'branch refs/heads/staging',
      '',
      'worktree /repo/.claude/worktrees/cp-114',
      'HEAD def456',
      'branch refs/heads/feature/cp-114-hold',
      '',
    ].join('\n'),
  )

  assert.deepEqual(entries, [
    { path: '/repo', branch: 'staging', prunable: false },
    { path: '/repo/.claude/worktrees/cp-114', branch: 'feature/cp-114-hold', prunable: false },
  ])
})

test('a detached worktree has no branch', () => {
  const entries = parseWorktreeList(['worktree /repo/wt/explore', 'HEAD abc123', 'detached', ''].join('\n'))
  assert.equal(entries[0]?.branch, null)
  assert.equal(entries[0]?.prunable, false)
})

/*
 * This is what an interrupted removal leaves: git deletes the `.git` link first,
 * so the entry survives pointing at nothing. Recognizing it is what lets the
 * panel clean it up instead of failing forever on `git worktree remove`.
 */
test('marks as prunable the leftovers of a removal that did not finish', () => {
  const entries = parseWorktreeList(
    [
      'worktree /repo/wt/big',
      'HEAD abc123',
      'branch refs/heads/feature/big',
      'prunable gitdir file points to non-existent location',
      '',
    ].join('\n'),
  )
  assert.equal(entries[0]?.prunable, true)
  assert.equal(entries[0]?.branch, 'feature/big')
})

test('ignores anything before the first worktree line', () => {
  assert.deepEqual(parseWorktreeList('branch refs/heads/orphan\n'), [])
})
