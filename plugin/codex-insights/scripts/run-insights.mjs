#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const linkedBinary =
  process.platform === 'win32' ? 'codex-session-insights.cmd' : 'codex-session-insights'
const repositoryCli = fileURLToPath(
  new URL('../../../bin/codex-insights.js', import.meta.url),
)

const linkedResult = await run(linkedBinary, args)
if (linkedResult.kind === 'missing') {
  const fallbackResult = await run(process.execPath, [repositoryCli, ...args])
  if (fallbackResult.kind === 'missing') {
    process.stderr.write('Unable to locate the Codex Insights CLI.\n')
    process.exitCode = 1
  }
}

async function run(command, commandArgs) {
  return new Promise(resolve => {
    const child = spawn(command, commandArgs, { stdio: 'inherit' })
    let spawned = false

    child.once('spawn', () => {
      spawned = true
    })
    child.once('error', error => {
      if (!spawned && /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
        resolve({ kind: 'missing' })
        return
      }
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
      resolve({ kind: 'failed' })
    })
    child.once('close', (code, signal) => {
      if (!spawned) return
      if (signal) {
        process.kill(process.pid, signal)
        resolve({ kind: 'failed' })
        return
      }
      process.exitCode = code ?? 1
      resolve({ kind: code === 0 ? 'completed' : 'failed' })
    })
  })
}
