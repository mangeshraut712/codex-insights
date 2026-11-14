import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cacheFilePath, writePrivateCacheJson } from '../lib/cache-path.js'

test('writePrivateCacheJson keeps new and existing cache files owner-readable only', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-insights-cache-'))
  const cachePath = cacheFilePath(dir, 'synthetic-thread')
  try {
    await fs.writeFile(cachePath, '{"stale":true}', { encoding: 'utf8', mode: 0o644 })
    await writePrivateCacheJson(cachePath, { summary: 'Synthetic private cache data.' })

    assert.deepEqual(JSON.parse(await fs.readFile(cachePath, 'utf8')), {
      summary: 'Synthetic private cache data.',
    })
    assert.equal((await fs.stat(cachePath)).mode & 0o777, 0o600)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
