#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function listScripts(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listScripts(fullPath)))
      continue
    }
    if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) files.push(fullPath)
  }
  return files
}

const files = [
  ...(await listScripts(path.join(root, 'bin'))),
  ...(await listScripts(path.join(root, 'lib'))),
  path.join(root, 'plugin/codex-insights/scripts/run-insights.mjs'),
  path.join(root, 'scripts/generate-test-report.mjs'),
]

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const typecheck = spawnSync('npm', ['run', 'typecheck'], { cwd: root, stdio: 'inherit', shell: false })
if (typecheck.status !== 0) process.exit(typecheck.status ?? 1)
