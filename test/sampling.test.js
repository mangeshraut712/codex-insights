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
