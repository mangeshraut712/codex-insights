import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadSeenStore } from '../lib/seen-sessions.js'

test('loadSeenStore recovers from corrupt JSON instead of failing the report', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-insights-seen-'))
  await fs.writeFile(path.join(dir, 'seen-sessions.json'), '{', 'utf8')
  const store = await loadSeenStore(dir)
  assert.deepEqual(store.sessions, {})
})
