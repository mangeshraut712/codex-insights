import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { cacheFilePath } from '../lib/cache-path.js'
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

test('planFacetJobs sanitizes stale unselected facet caches', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-insights-stale-facets-'))
  const model = 'synthetic-model'
  const thread = makeThread('stale', '/repo/alpha', '2026-01-05T12:00:00.000Z')
  const secret = 'sk-proj-SYNTHETICSTALESECRET1234567890'
  const cachePath = path.join(cacheDir, `${thread.id}.json`)
  await fs.writeFile(
    cachePath,
    JSON.stringify({
      versionKey: 'obsolete-version',
      facet: { threadId: thread.id, brief_summary: `Used ${secret}` },
    }),
  )

  const jobs = await llmTest.planFacetJobs([thread], { cacheDir, model, uncachedLimit: 0 })

  assert.deepEqual(jobs, [])
  const persisted = await fs.readFile(cachePath, 'utf8')
  assert.doesNotMatch(persisted, new RegExp(secret))
  assert.match(persisted, /\[REDACTED_API_KEY\]/)
})

test('mergeTrustedFacet keeps collector identity ahead of model fields', () => {
  const facet = llmTest.mergeTrustedFacet(
    {
      id: 'real-thread',
      title: 'Real title',
      cwd: '/real/project',
      updatedAt: '2026-01-05T12:00:00.000Z',
      durationMinutes: 4,
      userMessages: 3,
      assistantMessages: 2,
      totalToolCalls: 1,
      totalCommandFailures: 0,
    },
    { threadId: 'spoofed', cwd: '/spoofed', brief_summary: 'kept' },
  )
  assert.equal(facet.threadId, 'real-thread')
  assert.equal(facet.cwd, '/real/project')
  assert.equal(facet.title, 'Real title')
  assert.equal(facet.brief_summary, 'kept')
})

test('facet caches cannot be written outside the cache directory', async () => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-insights-cache-path-'))
  const id = '../../outside'
  const safePath = cacheFilePath(cacheDir, id)
  assert.equal(path.dirname(safePath), path.resolve(cacheDir))
  const secret = 'sk-proj-SYNTHETICPATHSECRET1234567890'
  const thread = makeThread(id, '/repo/alpha', '2026-01-05T12:00:00.000Z')
  await fs.writeFile(safePath, JSON.stringify({
    versionKey: llmTest.buildFacetVersionKey(thread, 'synthetic-model'),
    facet: { threadId: id, brief_summary: `Used ${secret}` },
  }))

  await llmTest.planFacetJobs([thread], { cacheDir, model: 'synthetic-model', uncachedLimit: 0 })

  assert.doesNotMatch(await fs.readFile(safePath, 'utf8'), new RegExp(secret))
  await assert.rejects(fs.access(path.resolve(cacheDir, '../../outside.json')))
})
