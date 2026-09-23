import path from 'node:path'
import { spawn } from 'node:child_process'

export const DEFAULT_REPO_SLUG = 'mangeshraut712/codex-insights'
const VERSION_TIMEOUT_MS = 15_000

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
  const response = await fetchImpl(`https://raw.githubusercontent.com/${repoSlug}/HEAD/package.json`, {
    signal: AbortSignal.timeout(VERSION_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Cannot check the latest version (HTTP ${response.status})`)
  /** @type {{ version?: unknown }} */
  const manifest = await response.json()
  const version = manifest?.version
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+/.test(version)) throw new Error('Latest package.json has no version')
  return version
}

/** Runs the public installer, which refreshes both the CLI and the $insights plugin. */
export function runInstaller({ repoSlug = DEFAULT_REPO_SLUG, spawnImpl = spawn } = {}) {
  const env = { ...process.env, PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter) }
  const script = `curl -fsSL https://raw.githubusercontent.com/${repoSlug}/HEAD/scripts/install.sh | bash`
  return new Promise((resolve, reject) => {
    const child = spawnImpl('bash', ['-c', script], { env, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`Installer exited with code ${code}`))))
  })
}

export async function selfUpdate({ currentVersion, repoSlug, fetchImpl, install = runInstaller }) {
  const latest = await fetchLatestVersion({ repoSlug, fetchImpl })
  if (compareVersions(latest, currentVersion) <= 0) return { updated: false, latest }
  await install({ repoSlug })
  return { updated: true, latest }
}
