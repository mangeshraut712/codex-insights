import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildPublicProfile, renderPublicProfile, writePublicProfile } from '../lib/profile.js'
import { createSampleReport } from './fixtures/sample-report.js'
import { runCli } from '../lib/cli.js'

test('public profile exports only approved aggregates and escapes display text', async () => {
  const report = createSampleReport()
  report.threads[0].title = 'SECRET THREAD TITLE'
  report.charts.projects[0].label = 'SECRET PROJECT PATH'
  report.insights.at_a_glance.whats_working = 'SECRET NARRATIVE'
  report.charts.models[0].label = '<script>alert(1)</script>'
  const profile = buildPublicProfile(report, { name: '<b>Ada</b>', handle: 'coder' })
  assert.deepEqual(profile.activityDays.map(day => day.date), ['2026-04-02', '2026-04-04'])
  const html = renderPublicProfile(profile)
  assert.match(html, /&lt;b&gt;Ada&lt;\/b&gt;/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /@coder/)
  assert.doesNotMatch(html, /SECRET THREAD TITLE|SECRET PROJECT PATH|SECRET NARRATIVE|\/tmp\/\.codex/)
  assert.match(html, /177|267/)
})

test('profile CLI writes a standalone index from an existing report', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-insights-profile-'))
  const reportPath = path.join(dir, 'report.json')
  await fs.writeFile(reportPath, JSON.stringify(createSampleReport()))
  await runCli(['profile', '--report-json', reportPath, '--out-dir', path.join(dir, 'site'), '--name', 'Ada', '--handle', '@coder'])
  const html = await fs.readFile(path.join(dir, 'site', 'index.html'), 'utf8')
  assert.match(html, /Ada/)
  assert.match(html, /@coder/)
  assert.match(html, /<!doctype html>/)
})
