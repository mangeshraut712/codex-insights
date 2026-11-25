import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { publishProfileSite, validateBranchName, validateRepoSlug, validateSiteDir } from '../lib/publish.js'

const PROFILE = {
  generatedAt: '2026-02-02T00:00:00.000Z',
  footer: 'Stats as of 2026-02-02',
  stats: { sessions: 3 },
}

async function makeProfileDir(dir) {
  const profileDir = path.join(dir, 'profile')
  await mkdir(profileDir, { recursive: true })
  await writeFile(path.join(profileDir, 'profile.json'), JSON.stringify(PROFILE))
  await writeFile(path.join(profileDir, 'index.html'), '<html></html>')
  return profileDir
}

function recordingGit(calls) {
  return async args => {
    calls.push(args)
    return ''
  }
}

test('validateRepoSlug accepts owner/name and rejects anything else', () => {
  assert.equal(validateRepoSlug('mangeshraut712/codex-insights'), 'mangeshraut712/codex-insights')
  assert.equal(validateRepoSlug('Owner.Name_1-x/y.z'), 'Owner.Name_1-x/y.z')
  for (const value of ['../evil', 'owner/..', 'owner', 'a/b/c', 'owner//name', 'owner/na me', 'owner/name?x=1']) {
    assert.throws(() => validateRepoSlug(value), /Invalid --repo/)
  }
})

test('validateBranchName blocks option injection and invalid git refs', () => {
  assert.equal(validateBranchName('main'), 'main')
  assert.equal(validateBranchName('feature/release-1.2'), 'feature/release-1.2')
  for (const value of ['--exec=evil', 'main.lock', 'a..b', 'main@{1', 'feature/', 'x'.repeat(129)]) {
    assert.throws(() => validateBranchName(value), /Invalid --branch/)
  }
})

test('validateSiteDir normalizes separators and blocks escapes from the clone', () => {
  assert.equal(validateSiteDir('docs'), 'docs')
  assert.equal(validateSiteDir('.\\site'), 'site')
  for (const value of ['/absolute/path', '../outside', 'docs/../../etc', '..\\..\\windows']) {
    assert.throws(() => validateSiteDir(value), /Invalid --site-dir/)
  }
})

test('publishProfileSite refuses to delete a directory it does not own', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'publish-refuse-'))
  try {
    const profileDir = await makeProfileDir(dir)
    const workDir = path.join(dir, 'work')
    await mkdir(workDir)
    await writeFile(path.join(workDir, 'precious.txt'), 'do not delete')
    const git = async () => {
      throw new Error('git must not run for an unowned directory')
    }
    await assert.rejects(publishProfileSite({ profileDir, repo: 'owner/site', workDir, git }), /Refusing to delete/)
    assert.equal(await readFile(path.join(workDir, 'precious.txt'), 'utf8'), 'do not delete')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('publishProfileSite skips the commit when only generatedAt changed', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'publish-skip-'))
  try {
    const profileDir = await makeProfileDir(dir)
    const workDir = path.join(dir, 'work')
    await mkdir(path.join(workDir, '.git'), { recursive: true })
    await mkdir(path.join(workDir, 'docs'), { recursive: true })
    await writeFile(
      path.join(workDir, 'docs', 'profile.json'),
      JSON.stringify({ ...PROFILE, generatedAt: '2020-01-01T00:00:00.000Z' }),
    )
    const calls = []
    const result = await publishProfileSite({ profileDir, repo: 'owner/site', workDir, git: recordingGit(calls) })
    assert.deepEqual(result, { changed: false })
    assert.deepEqual(
      calls.map(args => args[0]),
      ['fetch', 'reset'],
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('publishProfileSite copies the site, commits the stats date, and pushes HEAD to the branch', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'publish-push-'))
  try {
    const profileDir = await makeProfileDir(dir)
    const workDir = path.join(dir, 'work')
    await mkdir(path.join(workDir, '.git'), { recursive: true })
    const calls = []
    const result = await publishProfileSite({ profileDir, repo: 'owner/site', workDir, git: recordingGit(calls) })
    assert.deepEqual(result, { changed: true })
    assert.equal(await readFile(path.join(workDir, 'docs', 'profile.json'), 'utf8'), JSON.stringify(PROFILE))
    assert.equal(await readFile(path.join(workDir, 'docs', 'index.html'), 'utf8'), '<html></html>')
    assert.deepEqual(
      calls.find(args => args[0] === 'add'),
      ['add', '--', 'docs/index.html', 'docs/profile.json'],
    )
    const commitMessage = calls[calls.findIndex(args => args[0] === 'commit')].at(-1)
    assert.equal(commitMessage, 'Update Codex profile (stats as of 2026-02-02)')
    assert.deepEqual(calls.at(-1), ['push', '--quiet', 'origin', 'HEAD:main'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
