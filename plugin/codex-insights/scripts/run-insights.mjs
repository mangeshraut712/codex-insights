#!/usr/bin/env node

import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const linkedBinary =
  process.platform === 'win32' ? 'codex-session-insights.cmd' : 'codex-session-insights'
const repositoryCli = fileURLToPath(
  new URL('../../../bin/codex-insights.js', import.meta.url),
)
const env = withLookupPath(process.env)

const linkedResult = await run(linkedBinary, args)
if (linkedResult.kind === 'missing') {
  if (await isFile(repositoryCli)) {
    await run(process.execPath, [repositoryCli, ...args])
  } else {
    writeInstallHelp()
    process.exitCode = 1
  }
}

function withLookupPath(baseEnv) {
  const home = os.homedir()
  const extra = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.cargo', 'bin'),
    path.join(home, '.codex', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]
  const delimiter = path.delimiter
  const current = typeof baseEnv.PATH === 'string' ? baseEnv.PATH : ''
  const merged = []
  const seen = new Set()
  for (const dir of [...extra, ...current.split(delimiter)]) {
    if (!dir || seen.has(dir)) continue
    seen.add(dir)
    merged.push(dir)
  }
  return { ...baseEnv, PATH: merged.join(delimiter) }
}

async function isFile(filePath) {
  try {
    await access(filePath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

function writeInstallHelp() {
  process.stderr.write(
    [
      'Unable to locate the Codex Insights CLI (codex-session-insights).',
      '$insights needs that CLI on PATH. Codex Desktop often omits Homebrew and ~/.local/bin.',
      'Install it, then start a new Codex thread:',
      '  npm install --global github:mangeshraut712/codex-insights',
      '  curl -fsSL https://raw.githubusercontent.com/mangeshraut712/codex-insights/HEAD/scripts/install.sh | bash',
      '',
    ].join('\n'),
  )
}

async function run(command, commandArgs) {
  return new Promise(resolve => {
    const child = spawn(command, commandArgs, { stdio: 'inherit', env })
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
