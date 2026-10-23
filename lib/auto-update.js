import path from 'node:path'
import { spawn } from 'node:child_process'
import { validateRepoSlug } from './publish.js'

export const DEFAULT_REPO_SLUG = 'mangeshraut712/codex-insights'
const VERSION_TIMEOUT_MS = 15_000
const STABLE_VERSION = /^\d+\.\d+\.\d+$/

export function compareVersions(a, b) {
  const parse = value => String(value).split('.').map(part => Number.parseInt(part, 10) || 0)
  const left = parse(a)
  const right = parse(b)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0)
    if (diff) return Math.sign(diff)
  }
  return 0
}

export async function fetchLatestVersion({ repoSlug = DEFAULT_REPO_SLUG, fetchImpl = globalThis.fetch } = {}) {
  const slug = validateRepoSlug(repoSlug)
  const response = await fetchImpl(`https://raw.githubusercontent.com/${slug}/HEAD/package.json`, {
    signal: AbortSignal.timeout(VERSION_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Cannot check the latest version (HTTP ${response.status})`)
  /** @type {{ version?: unknown }} */
  const manifest = await response.json()
  const version = manifest?.version
  if (typeof version !== 'string' || !STABLE_VERSION.test(version)) throw new Error('Latest package.json has no stable version')
  return version
}

/** Runs the public installer, which refreshes both the CLI and the $insights plugin. */
export function runInstaller({ repoSlug = DEFAULT_REPO_SLUG, spawnImpl = spawn } = {}) {
  const slug = validateRepoSlug(repoSlug)
  const url = `https://raw.githubusercontent.com/${slug}/HEAD/scripts/install.sh`
  const env = { ...process.env, PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter) }
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = error => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve()
    }
    const curl = spawnImpl('curl', ['-fsSL', url], { env, stdio: ['ignore', 'pipe', 'inherit'] })
    const bash = spawnImpl('bash', ['-s', '--'], { env, stdio: ['pipe', 'inherit', 'inherit'] })
    if (!curl?.stdout || !bash?.stdin) {
      finish(new Error('Installer could not be started'))
      return
    }
    curl.stdout.pipe(bash.stdin)
    curl.on('error', finish)
    bash.on('error', finish)
    curl.on('exit', code => {
      if (code === 0) return
      bash.kill('SIGTERM')
      finish(new Error(`Installer download exited with code ${code ?? 'unknown'}`))
    })
    bash.on('exit', code => {
      if (code === 0) finish()
      else finish(new Error(`Installer exited with code ${code ?? 'unknown'}`))
    })
  })
}

export async function selfUpdate({ currentVersion, repoSlug, fetchImpl, install = runInstaller }) {
  const latest = await fetchLatestVersion({ repoSlug, fetchImpl })
  if (compareVersions(latest, currentVersion) <= 0) return { updated: false, latest }
  await install({ repoSlug })
  return { updated: true, latest }
}
