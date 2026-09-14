import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { commonBinDirectories, mergeLookupPath, resolveCodexBin } from '../lib/resolve-bin.js'

test('mergeLookupPath prepends Homebrew and ~/.local/bin without dropping the original PATH', () => {
  const env = mergeLookupPath({ PATH: '/usr/bin:/bin' }, '/Users/demo')
  const parts = env.PATH.split(path.delimiter)

  assert.equal(parts[0], path.join('/Users/demo', '.local', 'bin'))
  assert.ok(parts.includes('/opt/homebrew/bin'))
  assert.ok(parts.includes('/usr/local/bin'))
  assert.ok(parts.includes('/usr/bin'))
  assert.ok(parts.includes('/bin'))
  assert.deepEqual(commonBinDirectories('/Users/demo')[0], path.join('/Users/demo', '.local', 'bin'))
})

test('resolveCodexBin prefers --codex-bin, then CODEX_BIN, then an executable on the lookup PATH', async () => {
  assert.equal(resolveCodexBin(' /custom/codex ', { PATH: '' }), '/custom/codex')
  assert.equal(
    resolveCodexBin(null, { PATH: '', CODEX_BIN: '/env/codex' }),
    '/env/codex',
  )

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'insights-codex-bin-'))
  try {
    const binDir = path.join(root, 'bin')
    await fs.mkdir(binDir)
    const fakeCodex = path.join(binDir, 'codex')
    await fs.writeFile(fakeCodex, '#!/bin/sh\nexit 0\n', { mode: 0o755 })

    assert.equal(
      resolveCodexBin(null, { PATH: binDir, CODEX_BIN: '' }, root),
      fakeCodex,
    )
    assert.equal(resolveCodexBin(undefined, { PATH: '' }, root), 'codex')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
