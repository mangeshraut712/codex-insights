import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { compareVersions, selfUpdate } from '../lib/auto-update.js'
import { publishProfileSite, validateRepoSlug, validateSiteDir } from '../lib/publish.js'
import { LAUNCH_AGENT_LABEL, buildLaunchAgentPlist, installSchedule, readScheduleStatus, removeSchedule } from '../lib/schedule.js'
import { __test as cliTest, runCli } from '../lib/cli.js'
import { normalizeAccountProfile } from '../lib/account-profile.js'

const tempDir = prefix => fs.mkdtemp(path.join(os.tmpdir(), prefix))

function account(lifetimeTokens) {
  return normalizeAccountProfile({ summary: { lifetimeTokens }, dailyUsageBuckets: [{ startDate: '2026-09-22', tokens: lifetimeTokens }] }, null)
}

async function writeProfile(dir, profile) {
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html>')
  await fs.writeFile(path.join(dir, 'profile.json'), JSON.stringify(profile))
}

test('compareVersions orders semantic versions numerically', () => {
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1)
  assert.equal(compareVersions('0.5.0', '0.5.0'), 0)
  assert.equal(compareVersions('0.4.1', '0.5.0'), -1)
})

test('selfUpdate installs only when GitHub has a newer version', async () => {
  const installs = []
  const fetchVersion = version => async () => ({ ok: true, json: async () => ({ version }) })
  const install = async options => { installs.push(options) }

  assert.deepEqual(await selfUpdate({ currentVersion: '0.5.0', fetchImpl: fetchVersion('0.5.0'), install }), { updated: false, latest: '0.5.0' })
  assert.equal(installs.length, 0)
  assert.deepEqual(await selfUpdate({ currentVersion: '0.5.0', fetchImpl: fetchVersion('0.6.0'), install }), { updated: true, latest: '0.6.0' })
  assert.equal(installs.length, 1)
})

test('publishProfileSite commits and pushes only when displayed stats change', async () => {
  const root = await tempDir('codex-insights-publish-')
  const profileDir = path.join(root, 'profile')
  const workDir = path.join(root, 'clone')
  const calls = []
  const git = async (args, options = {}) => {
    calls.push(args[0])
    if (args[0] === 'clone') {
      await fs.mkdir(path.join(args.at(-1), '.git'), { recursive: true })
      await writeProfile(path.join(args.at(-1), 'docs'), { stats: [{ value: 'old' }], generatedAt: 'a' })
    }
    return options.cwd ?? ''
  }

  await writeProfile(profileDir, { stats: [{ value: 'new' }], footer: 'stats as of 2026-09-22', generatedAt: 'b' })
  assert.deepEqual(await publishProfileSite({ profileDir, repo: 'ada/site', workDir, git }), { changed: true })
  assert.deepEqual(calls, ['clone', 'add', 'commit', 'push'])
  assert.equal(JSON.parse(await fs.readFile(path.join(workDir, 'docs', 'profile.json'), 'utf8')).stats[0].value, 'new')

  calls.length = 0
  await writeProfile(profileDir, { stats: [{ value: 'new' }], footer: 'stats as of 2026-09-22', generatedAt: 'c' })
  assert.deepEqual(await publishProfileSite({ profileDir, repo: 'ada/site', workDir, git }), { changed: false })
  assert.deepEqual(calls, ['fetch', 'reset'])
})

test('publish options reject unsafe repository slugs and site paths', () => {
  assert.equal(validateRepoSlug('ada/codex-profile'), 'ada/codex-profile')
  assert.throws(() => validateRepoSlug('https://github.com/ada/x'), /Invalid --repo/)
  assert.equal(validateSiteDir('docs/'), 'docs/')
  assert.throws(() => validateSiteDir('../etc'), /Invalid --site-dir/)
  assert.throws(() => validateSiteDir('/tmp'), /Invalid --site-dir/)
})

test('launch agent runs auto on an interval with a PATH that can find Node and Codex', () => {
  const plist = buildLaunchAgentPlist({
    nodePath: '/opt/node/bin/node',
    cliPath: '/Users/ada/.local/bin/codex-session-insights',
    autoArgs: ['--repo', 'ada/site&co'],
    intervalHours: 12,
    logPath: '/Users/ada/.codex/usage-data/auto-update.log',
    homeDir: '/Users/ada',
  })
  assert.match(plist, new RegExp(`<string>${LAUNCH_AGENT_LABEL}</string>`))
  assert.match(plist, /<string>\/opt\/node\/bin\/node<\/string>\n {4}<string>\/Users\/ada\/.local\/bin\/codex-session-insights<\/string>\n {4}<string>auto<\/string>/)
  assert.match(plist, /ada\/site&amp;co/)
  assert.match(plist, /<integer>43200<\/integer>/)
  assert.match(plist, /<string>\/opt\/node\/bin:\/Users\/ada\/.local\/bin:\/opt\/homebrew\/bin/)
})

test('installSchedule writes and loads the agent; status and remove read it back', async () => {
  const homeDir = await tempDir('codex-insights-home-')
  const commands = []
  const run = async (command, args) => { commands.push([command, args[0]]) }
  const { plistPath } = await installSchedule({
    platform: 'darwin', run, homeDir, nodePath: '/n/node', cliPath: '/c/cli', autoArgs: [], intervalHours: 6,
  })
  assert.deepEqual(commands, [['launchctl', 'bootout'], ['launchctl', 'bootstrap']])
  const status = await readScheduleStatus({ homeDir })
  assert.equal(status.installed, true)
  assert.equal(status.intervalHours, 6)

  await removeSchedule({ platform: 'darwin', run, homeDir })
  await assert.rejects(fs.access(plistPath))
  await assert.rejects(installSchedule({ platform: 'linux', run, homeDir }), /cron entry/)
})

test('auto re-runs the new version after a self-update instead of continuing with old code', async () => {
  const reruns = []
  let accountReads = 0
  await runCli(['auto', '--repo', 'ada/site'], {
    selfUpdate: async () => ({ updated: true, latest: '9.9.9' }),
    rerunCli: async args => { reruns.push(args) },
    collectAccountProfile: async () => { accountReads += 1; return account(1) },
  })
  assert.deepEqual(reruns, [['auto', '--repo', 'ada/site', '--no-self-update']])
  assert.equal(accountReads, 0)
})

test('auto refreshes the account profile and publishes it to the requested repository', async () => {
  const codexHome = await tempDir('codex-insights-auto-')
  const published = []
  await runCli(['auto', '--codex-home', codexHome, '--repo', 'ada/site', '--site-dir', 'public'], {
    selfUpdate: async () => ({ updated: false, latest: '0.0.1' }),
    collectAccountProfile: async () => account(5000),
    publishProfileSite: async options => { published.push(options); return { changed: true } },
  })
  const profile = JSON.parse(await fs.readFile(path.join(codexHome, 'usage-data', 'profile', 'profile.json'), 'utf8'))
  assert.equal(profile.source, 'account')
  assert.equal(published.length, 1)
  assert.equal(published[0].repo, 'ada/site')
  assert.equal(published[0].siteDir, 'public')
  assert.equal(published[0].workDir, path.join(codexHome, 'usage-data', 'profile-publish', 'ada__site'))

  await assert.rejects(
    runCli(['auto', '--codex-home', codexHome, '--no-self-update'], {
      collectAccountProfile: async () => { throw new Error('signed out') },
    }),
    /Cannot read Codex account stats: signed out/,
  )
})

test('schedule install passes the publish target and chosen identity to each run', async () => {
  const installs = []
  await runCli(['schedule', 'install', '--every', '6', '--repo', 'ada/site', '--name', 'Ada L', '--handle', 'ada'], {
    installSchedule: async options => { installs.push(options); return { plistPath: '/p', logPath: '/l' } },
  })
  assert.equal(installs[0].intervalHours, 6)
  assert.deepEqual(installs[0].autoArgs, ['--repo', 'ada/site', '--site-dir', 'docs', '--branch', 'main', '--name', 'Ada L', '--handle', 'ada'])
  await assert.rejects(runCli(['schedule', 'pause']), /Usage: codex-session-insights schedule/)
})

test('parseArgs reads schedule subcommands and auto options', () => {
  const parsed = cliTest.parseArgs(['schedule', 'install', '--every', '6', '--repo', 'ada/site', '--no-self-update'])
  assert.equal(parsed.command, 'schedule')
  assert.equal(parsed.subcommand, 'install')
  assert.equal(parsed.options.everyHours, 6)
  assert.equal(parsed.options.publishRepo, 'ada/site')
  assert.equal(parsed.options.selfUpdate, false)
  assert.throws(() => cliTest.parseArgs(['auto', '--repo', 'not a slug']), /Invalid --repo/)
})
