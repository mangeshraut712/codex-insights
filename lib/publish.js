import path from 'node:path'
import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const SITE_FILES = ['index.html', 'profile.json']
const PUBLISH_MARKER = '.codex-insights-publish'

export function validateRepoSlug(value) {
  const slug = String(value)
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(slug)) {
    throw new Error(`Invalid --repo "${value}". Expected owner/name.`)
  }
  const [owner, name] = slug.split('/')
  if (owner === '.' || owner === '..' || name === '.' || name === '..') {
    throw new Error(`Invalid --repo "${value}". Expected owner/name.`)
  }
  return slug
}

export function validateBranchName(value) {
  const branch = String(value)
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(branch) ||
    branch.includes('..') ||
    branch.includes('@{') ||
    branch.endsWith('/') ||
    branch.endsWith('.lock')
  ) {
    throw new Error(`Invalid --branch "${value}".`)
  }
  return branch
}

export function validateSiteDir(value) {
  const normalized = path.posix.normalize(String(value).replace(/\\/g, '/'))
  if (path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`Invalid --site-dir "${value}". Use a path inside the repository.`)
  }
  return normalized
}

export async function runGit(args, options = {}) {
  const { stdout } = await execFileAsync('git', args, { cwd: options.cwd, maxBuffer: 8 * 1024 * 1024 })
  return stdout
}

function withoutTimestamp(profile) {
  if (!profile || typeof profile !== 'object') return null
  const { generatedAt: _generatedAt, ...rest } = profile
  return JSON.stringify(rest)
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Copies a generated profile into a dedicated clone of the publishing repository and pushes it,
 * but only when the displayed stats changed. The clone is owned by this tool and reset to the
 * remote branch before each run, so it never touches a working checkout.
 */
export async function publishProfileSite({ profileDir, repo, siteDir = 'docs', branch = 'main', workDir, git = runGit }) {
  const slug = validateRepoSlug(repo)
  const site = validateSiteDir(siteDir)
  const ref = validateBranchName(branch)
  const next = await readJson(path.join(profileDir, 'profile.json'))
  if (!next) throw new Error(`No generated profile.json in ${profileDir}`)

  let ready = false
  try {
    await fs.access(path.join(workDir, '.git'))
    await git(['fetch', '--quiet', 'origin', ref], { cwd: workDir })
    await git(['reset', '--quiet', '--hard', `origin/${ref}`], { cwd: workDir })
    ready = true
  } catch {
    ready = false
  }

  if (!ready) {
    await replacePublishClone(workDir, slug, ref, git)
  }

  const targetDir = path.join(workDir, site)
  const current = await readJson(path.join(targetDir, 'profile.json'))
  if (withoutTimestamp(current) === withoutTimestamp(next)) return { changed: false }

  await fs.mkdir(targetDir, { recursive: true })
  for (const file of SITE_FILES) {
    await fs.copyFile(path.join(profileDir, file), path.join(targetDir, file))
    await fs.chmod(path.join(targetDir, file), 0o644)
  }
  const asOf = next.footer?.match(/as of (\d{4}-\d{2}-\d{2})/)?.[1]
  await git(['add', '--', ...SITE_FILES.map(file => path.posix.join(site, file))], { cwd: workDir })
  await git(['commit', '--quiet', '-m', `Update Codex profile${asOf ? ` (stats as of ${asOf})` : ''}`], { cwd: workDir })
  await git(['push', '--quiet', 'origin', `HEAD:${ref}`], { cwd: workDir })
  return { changed: true }
}

async function replacePublishClone(workDir, slug, branch, git) {
  const entries = await directoryEntries(workDir)
  const owned = !entries || entries.length === 0 || entries.includes(PUBLISH_MARKER)
  if (!owned) {
    throw new Error(`Refusing to delete ${workDir}; it is not a Codex Insights publish clone.`)
  }
  await fs.rm(workDir, { recursive: true, force: true })
  await fs.mkdir(path.dirname(workDir), { recursive: true })
  await git(['clone', '--quiet', '--branch', branch, '--single-branch', `https://github.com/${slug}.git`, workDir])
  await fs.writeFile(path.join(workDir, PUBLISH_MARKER), 'codex-insights\n', 'utf8')
}

async function directoryEntries(dir) {
  try {
    return await fs.readdir(dir)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}
