import test from 'node:test'
import assert from 'node:assert/strict'
import { selectRepresentativeThreads } from '../lib/sampling.js'

function makeThread(id, cwd, updatedAt) {
  return { id, cwd, updatedAt }
}

test('selectRepresentativeThreads is stable and balances project and calendar-week strata', () => {
  const weeks = ['2026-01-05T12:00:00.000Z', '2026-01-12T12:00:00.000Z', '2026-01-19T12:00:00.000Z']
  const projects = ['/repo/alpha', '/repo/beta', '/repo/gamma']
  const threads = []

  for (const project of projects) {
    for (const [weekIndex, updatedAt] of weeks.entries()) {
      threads.push(makeThread(`${project.split('/').at(-1)}-${weekIndex}-new`, project, updatedAt))
      threads.push(makeThread(`${project.split('/').at(-1)}-${weekIndex}-old`, project, '2026-01-01T12:00:00.000Z'))
    }
  }

  const selected = selectRepresentativeThreads([...threads].reverse(), 3)
  const repeated = selectRepresentativeThreads(threads, 3)

  assert.deepEqual(
    selected.map(thread => thread.id),
    repeated.map(thread => thread.id),
  )
  assert.equal(selected.length, 3)
  assert.deepEqual(
    new Set(selected.map(thread => thread.cwd)),
    new Set(projects),
  )
  assert.equal(new Set(selected.map(thread => thread.updatedAt)).size, 3)
})

test('selectRepresentativeThreads covers every available stratum before repeating one', () => {
  const threads = [
    makeThread('alpha-w1-new', '/repo/alpha', '2026-01-05T12:00:00.000Z'),
    makeThread('alpha-w1-old', '/repo/alpha', '2026-01-05T10:00:00.000Z'),
    makeThread('alpha-w2-new', '/repo/alpha', '2026-01-12T12:00:00.000Z'),
    makeThread('alpha-w2-old', '/repo/alpha', '2026-01-12T10:00:00.000Z'),
    makeThread('beta-w1', '/repo/beta', '2026-01-05T12:00:00.000Z'),
    makeThread('beta-w2', '/repo/beta', '2026-01-12T12:00:00.000Z'),
    makeThread('beta-w3', '/repo/beta', '2026-01-19T12:00:00.000Z'),
  ]

  const selected = selectRepresentativeThreads(threads, 5)

  assert.deepEqual(
    new Set(selected.map(thread => thread.id)),
    new Set(['alpha-w1-new', 'alpha-w2-new', 'beta-w1', 'beta-w2', 'beta-w3']),
  )
})
