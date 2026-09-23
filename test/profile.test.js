import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildAccountProfile, buildPublicProfile, durationLabel, renderPublicProfile, writeProfileSite } from '../lib/profile.js'
import { normalizeAccountProfile } from '../lib/account-profile.js'
import { createSampleReport } from './fixtures/sample-report.js'
import { runCli } from '../lib/cli.js'

function accountFixture() {
  return normalizeAccountProfile(
    { summary: { lifetimeTokens: 1 }, dailyUsageBuckets: [] },
    {
      profile: { username: 'ada', display_name: 'Ada Lovelace' },
      stats: {
        lifetime_tokens: 7_149_308_994,
        peak_daily_tokens: 334_500_086,
        current_streak_days: 5,
        longest_streak_days: 11,
        total_threads: 806,
        longest_running_turn_sec: 6423,
        fast_mode_usage_percentage: 51.99,
        total_skills_used: 1035,
        unique_skills_used: 89,
        most_used_reasoning_effort: 'high',
        most_used_reasoning_effort_percentage: 43.37,
        daily_usage_buckets: [
          { start_date: '2026-09-21', tokens: 200 },
          { start_date: '2026-09-20', tokens: 100 },
        ],
        top_invocations: [
          { type: 'skill', skill_id: 'abc', skill_name: 'goal-driven', usage_count: 169 },
          { type: 'plugin', plugin_id: 'build-web-apps@openai-curated', plugin_name: 'build-web-apps', usage_count: 83 },
          { type: 'skill', skill_name: '<img src=x>', usage_count: 2 },
        ],
      },
      metadata: { stats_as_of: '2026-09-22', stats_error: null },
    },
  )
}

test('public profile exports only approved aggregates and escapes display text', async () => {
  const report = createSampleReport()
  report.threads[0].title = 'SECRET THREAD TITLE'
  report.charts.projects[0].label = 'SECRET PROJECT PATH'
  report.insights.at_a_glance.whats_working = 'SECRET NARRATIVE'
  report.charts.models[0].label = '<script>alert(1)</script>'
  const profile = buildPublicProfile(report, { name: '<b>Ada</b>', handle: 'coder' })
  assert.deepEqual(profile.activity.daily.map(day => day.date), ['2026-04-02', '2026-04-04'])
  const html = renderPublicProfile(profile)
  assert.match(html, /&lt;b&gt;Ada&lt;\/b&gt;/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /@coder/)
  assert.doesNotMatch(html, /SECRET THREAD TITLE|SECRET PROJECT PATH|SECRET NARRATIVE|\/tmp\/\.codex/)
  assert.match(html, /177|267/)
})

test('public profile keeps fractional session hours', () => {
  const report = createSampleReport()
  report.summary.totalDurationHours = 1.6
  assert.match(renderPublicProfile(buildPublicProfile(report)), /<strong>1\.6h<\/strong>/)
})

test('public profile shows cache and reasoning shares and a --since scope', () => {
  const report = createSampleReport()
  Object.assign(report.summary, {
    totalInputTokens: 1000,
    totalCachedInputTokens: 900,
    totalOutputTokens: 200,
    totalReasoningOutputTokens: 50,
  })
  report.metadata.days = null
  report.metadata.since = '2026-09-01'
  const html = renderPublicProfile(buildPublicProfile(report))
  assert.match(html, /Token mix/)
  assert.match(html, /Served from cache<\/span><strong>90%/)
  assert.match(html, /Reasoning share of output<\/span><strong>25%/)
  assert.match(html, /Since 2026-09-01/)
})

test('public profile omits the token mix when no token data exists', () => {
  const report = createSampleReport()
  report.summary.totalInputTokens = 0
  assert.doesNotMatch(renderPublicProfile(buildPublicProfile(report)), /Token mix/)
})

test('account profile matches the Codex profile layout and values', () => {
  const profile = buildAccountProfile(accountFixture())
  assert.equal(profile.name, 'Ada Lovelace')
  assert.equal(profile.handle, 'ada')
  assert.deepEqual(profile.stats.map(stat => stat.value), ['7.1B', '334.5M', '1h 47m', '5 days', '11 days'])
  assert.deepEqual(profile.panels[0].rows.map(row => row.value), ['52%', 'High · 43%', '89', '1,035', '806'])
  assert.deepEqual(profile.activity.daily.map(point => point.date), ['2026-09-20', '2026-09-21'])
  assert.deepEqual(profile.activity.cumulative.map(point => point.value), [100, 300])
  assert.deepEqual(profile.activity.weekly, [{ date: '2026-09-20', value: 300 }])

  const html = renderPublicProfile(profile)
  assert.match(html, /<b class="prefix">\$<\/b>goal-driven<\/span><strong>169 runs/)
  assert.match(html, /<b class="prefix">@<\/b>build-web-apps<\/span><strong>83 runs/)
  assert.match(html, /&lt;img src=x&gt;/)
  assert.match(html, /as of 2026-09-22/)
  assert.doesNotMatch(html, /abc|openai-curated/)
})

test('account profile falls back to app-server usage when the profile endpoint is unavailable', () => {
  const account = normalizeAccountProfile(
    {
      summary: { lifetimeTokens: 5000, peakDailyTokens: 900, longestRunningTurnSec: 59, currentStreakDays: 1, longestStreakDays: 2 },
      dailyUsageBuckets: [{ startDate: '2026-09-01', tokens: 5000 }, { startDate: 'bad', tokens: 1 }],
    },
    null,
    'Activity insights unavailable: HTTP 401',
  )
  assert.equal(account.activity, null)
  assert.equal(account.warning, 'Activity insights unavailable: HTTP 401')
  const profile = buildAccountProfile(account, { name: 'Ada', handle: '@ada' })
  assert.deepEqual(profile.stats.map(stat => stat.value), ['5K', '900', '59s', '1 day', '2 days'])
  assert.equal(profile.activity.daily.length, 1)
  assert.match(renderPublicProfile(profile), /Activity insights were not available/)
})

test('durationLabel formats hours, minutes, and seconds like the Codex profile', () => {
  assert.equal(durationLabel(6423), '1h 47m')
  assert.equal(durationLabel(7200), '2h')
  assert.equal(durationLabel(125), '2m')
  assert.equal(durationLabel(0), '0s')
})

test('copy link handler does not read event.currentTarget after awaiting the clipboard', () => {
  const html = renderPublicProfile(buildPublicProfile(createSampleReport()))
  assert.doesNotMatch(html, /currentTarget/)
  assert.match(html, /shareButton\.textContent='Copied'/)
})

test('writeProfileSite writes index.html and an aggregate profile.json', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-insights-site-'))
  const { htmlPath, jsonPath } = await writeProfileSite(buildAccountProfile(accountFixture()), { outDir: dir })
  assert.match(await fs.readFile(htmlPath, 'utf8'), /<!doctype html>/)
  const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'))
  assert.equal(data.source, 'account')
  assert.equal(data.stats[0].value, '7.1B')
})

test('profile CLI writes a standalone index from an existing report with --source local', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-insights-profile-'))
  const reportPath = path.join(dir, 'report.json')
  await fs.writeFile(reportPath, JSON.stringify(createSampleReport()))
  let accountCalls = 0
  await runCli(
    ['profile', '--source', 'local', '--report-json', reportPath, '--out-dir', path.join(dir, 'site'), '--name', 'Ada', '--handle', '@coder'],
    { collectAccountProfile: async () => { accountCalls += 1; throw new Error('should not run') } },
  )
  const html = await fs.readFile(path.join(dir, 'site', 'index.html'), 'utf8')
  assert.equal(accountCalls, 0)
  assert.match(html, /Ada/)
  assert.match(html, /@coder/)
  assert.match(html, /Tokens in analyzed sessions/)
})

test('profile CLI prefers account stats and falls back to the local report on failure', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-insights-profile-auto-'))
  const reportPath = path.join(dir, 'report.json')
  await fs.writeFile(reportPath, JSON.stringify(createSampleReport()))

  await runCli(['profile', '--report-json', reportPath, '--out-dir', path.join(dir, 'account')], {
    collectAccountProfile: async () => accountFixture(),
  })
  assert.match(await fs.readFile(path.join(dir, 'account', 'index.html'), 'utf8'), /Lifetime tokens/)

  await runCli(['profile', '--report-json', reportPath, '--out-dir', path.join(dir, 'fallback')], {
    collectAccountProfile: async () => { throw new Error('not signed in') },
  })
  assert.match(await fs.readFile(path.join(dir, 'fallback', 'index.html'), 'utf8'), /Tokens in analyzed sessions/)

  await assert.rejects(
    runCli(['profile', '--source', 'account', '--out-dir', path.join(dir, 'strict')], {
      collectAccountProfile: async () => { throw new Error('not signed in') },
    }),
    /Cannot read Codex account stats: not signed in/,
  )
  await assert.rejects(runCli(['profile', '--source', 'cloud']), /Invalid --source/)
})
