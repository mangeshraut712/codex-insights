import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  archivedSummaryPath,
  createCoverage,
  loadSeenStore,
  loadUnseenAwarePopulation,
  persistAnalyzedSessions,
  readArchivedSummary,
} from '../lib/seen-sessions.js'

test('loadSeenStore recovers from corrupt JSON instead of failing the report', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-insights-seen-'))
  await fs.writeFile(path.join(dir, 'seen-sessions.json'), '{', 'utf8')
  const store = await loadSeenStore(dir)
  assert.deepEqual(store.sessions, {})
})

test('loadUnseenAwarePopulation refreshes a corrupt archived session summary', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-insights-seen-'))
  const thread = { id: 'synthetic-thread', updatedAt: '2026-04-01T00:00:00.000Z' }
  const summary = {
    ...thread,
    userMessages: 2,
    durationMinutes: 2,
    transcriptForAnalysis: 'Synthetic substantive session.',
  }
  try {
    await persistAnalyzedSessions(dir, [summary])
    await fs.writeFile(archivedSummaryPath(dir, thread.id), '{', 'utf8')

    let reads = 0
    const result = await loadUnseenAwarePopulation({
      eligibleThreads: [thread],
      coverage: createCoverage('synthetic'),
      usageDataDir: dir,
      unseenLimit: 1,
      readSummary: async () => {
        reads += 1
        return summary
      },
    })

    assert.equal(reads, 1)
    assert.deepEqual(result.summaries, [summary])
    assert.equal(result.coverage.reused, 0)
    assert.equal(result.coverage.unseenAnalyzed, 1)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('persistAnalyzedSessions redacts and privately stores archived summaries', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-insights-seen-'))
  const homeDir = '/Users/synthetic-archive'
  const secret = 'sk-proj-SYNTHETICARCHIVESECRET123456'
  const summary = {
    id: 'synthetic-private-thread',
    updatedAt: '2026-04-01T00:00:00.000Z',
    userMessages: 2,
    durationMinutes: 2,
    transcriptForAnalysis: `Use ${secret} from ${homeDir}/project.`,
  }
  try {
    await persistAnalyzedSessions(dir, [summary], { homeDir })

    const archivePath = archivedSummaryPath(dir, summary.id)
    const archiveText = await fs.readFile(archivePath, 'utf8')
    const restored = await readArchivedSummary(dir, summary.id, { homeDir })

    assert.doesNotMatch(archiveText, new RegExp(secret))
    assert.doesNotMatch(archiveText, new RegExp(homeDir))
    assert.match(archiveText, /\[REDACTED_API_KEY\]/)
    assert.doesNotMatch(JSON.stringify(restored), new RegExp(secret))
    assert.equal((await fs.stat(archivePath)).mode & 0o777, 0o600)
    assert.equal((await fs.stat(path.join(dir, 'seen-sessions.json'))).mode & 0o777, 0o600)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
