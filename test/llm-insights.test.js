import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { __test as llmTest } from '../lib/llm-insights.js'

function makeThread(id, cwd, updatedAt, transcript = 'User requested a substantive change.') {
  return {
    id,
    cwd,
    updatedAt,
    title: id,
    firstUserMessage: transcript,
    transcriptForAnalysis: transcript,
    userMessages: 2,
    durationMinutes: 2,
  }
}

test('planFacetJobs reuses redacted caches and samples uncached project-week strata', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-insights-facets-'))
  const model = 'synthetic-model'
  const cachedThread = makeThread('cached', '/repo/alpha', '2026-01-05T12:00:00.000Z')
  const secret = 'sk-proj-SYNTHETICCACHESECRET1234567890'
  const cachePath = path.join(cacheDir, `${cachedThread.id}.json`)
  await fs.writeFile(
    cachePath,
    JSON.stringify({
      versionKey: llmTest.buildFacetVersionKey(cachedThread, model),
      facet: { threadId: cachedThread.id, brief_summary: `Used ${secret}` },
    }),
  )
  const uncached = [
    makeThread('beta-old', '/repo/beta', '2026-01-05T12:00:00.000Z'),
    makeThread('beta-new', '/repo/beta', '2026-01-19T12:00:00.000Z'),
    makeThread('gamma', '/repo/gamma', '2026-01-12T12:00:00.000Z'),
  ]

  const jobs = await llmTest.planFacetJobs([cachedThread, ...uncached], {
    cacheDir,
    model,
    uncachedLimit: 2,
  })

  assert.equal(jobs.length, 3)
  assert.equal(jobs[0].thread.id, 'cached')
  assert.doesNotMatch(JSON.stringify(jobs[0].cachedFacet), new RegExp(secret))
  assert.match(JSON.stringify(jobs[0].cachedFacet), /\[REDACTED_API_KEY\]/)
  assert.equal(new Set(jobs.slice(1).map(job => job.thread.cwd)).size, 2)
  assert.doesNotMatch(await fs.readFile(cachePath, 'utf8'), new RegExp(secret))
})
