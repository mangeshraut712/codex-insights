import { test, expect } from 'e2e'
import { readFile, readdir, stat, chmod } from 'node:fs/promises'
import path from 'node:path'
import { fixture } from './fixture.mjs'
async function isolated(run) { const f = await fixture(); try { await run(f) } finally { await f.cleanup() } }
const options = { platforms: ['cli'] }
test('help and version are usable without an installed Codex account', options, async () => isolated(async f => {
  const help = await f.cli(['--help']); expect(help.code).toBe(0); expect(help.stdout).toContain('--local-only')
  const version = await f.cli(['--version']); expect(version.code).toBe(0); expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
}))
test('real SQLite and rollout data generate private report exports and cached reruns', options, async () => isolated(async f => {
  const out = path.join(f.dir, 'export')
  const args = ['--local-only', '--days', '0', '--data-source', 'legacy', '--no-open', '--stdout-json', '--out-dir', out]
  const first = await f.cli(args); expect(first.code).toBe(0)
  const report = JSON.parse(first.stdout); expect(report.analysisMode).toBe('local-only'); expect(report.metadata.threadCount).toBe(1)
  expect(JSON.parse(await readFile(path.join(out, 'report.json'), 'utf8')).metadata.threadCount).toBe(1)
  expect(await readFile(path.join(out, 'report.html'), 'utf8')).toContain('/synthetic/project')
  expect((await readdir(out)).some(n => /^report-.*\.json$/.test(n))).toBe(true)
  if (process.platform !== 'win32') expect((await stat(path.join(out, 'report.json'))).mode & 0o777).toBe(0o600)
  await chmod(path.join(out, 'report.json'), 0o644)
  const second = await f.cli(args); expect(second.code).toBe(0); expect(JSON.parse(second.stdout).metadata.threadCount).toBe(1)
  if (process.platform !== 'win32') for (const name of (await readdir(out)).filter(n => /^report.*\.(json|html)$/.test(n))) expect((await stat(path.join(out, name))).mode & 0o777).toBe(0o600)
}))
test('estimate-only does not write a report or invoke a model', options, async () => isolated(async f => {
  const out = path.join(f.dir, 'estimate')
  const result = await f.cli(['--estimate-only', '--days', '0', '--data-source', 'legacy', '--out-dir', out]); expect(result.code).toBe(0); expect(result.stdout).toContain('Estimate')
  expect(await readFile(path.join(out, 'report.json')).then(() => true, () => false)).toBe(false)
}))
test('local profile export contains aggregate stats and excludes private thread details', options, async () => isolated(async f => {
  const out = path.join(f.dir, 'profile')
  const result = await f.cli(['profile', '--source', 'local', '--report-json', f.report, '--name', 'Synthetic Reader', '--handle', 'fixture', '--out-dir', out]); expect(result.code).toBe(0)
  const data = await readFile(path.join(out, 'profile.json'), 'utf8'); expect(data).toContain('Synthetic Reader'); expect(data).not.toContain('Fix parser and publish package'); expect(data).not.toContain('/repo/')
  expect(await readFile(path.join(out, 'index.html'), 'utf8')).toContain('Synthetic Reader')
}))
for (const [label, args, error] of [
  ['unknown option', ['--does-not-exist'], 'Unknown argument'],
  ['conflicting date filters', ['--days', '7', '--since', '2026-01-01'], '--since'],
  ['conflicting generation modes', ['--local-only', '--estimate-only'], '--local-only'],
  ['unsupported provider', ['--provider', 'invalid'], 'Invalid provider'],
  ['missing local database', ['--local-only', '--data-source', 'legacy', '--codex-home', '/missing/synthetic-home'], 'ENOENT'],
  ['missing profile input', ['profile', '--source', 'local', '--report-json', '/missing/synthetic-report.json'], 'Cannot read report JSON'],
  ['unsafe publish repository', ['auto', '--repo', '../private'], 'repo'],
]) test(`fails clearly for ${label}`, options, async () => isolated(async f => {
  const result = await f.cli(args); expect(result.code).toBe(1); expect(result.stderr).toContain(error)
}))
test('explicit export paths and Chinese locale work through the CLI', options, async () => isolated(async f => {
  const json = path.join(f.dir, 'custom.json'); const html = path.join(f.dir, 'custom.html')
  const result = await f.cli(['report', '--local-only', '--days', '0', '--data-source', 'legacy', '--no-open', '--lang', 'zh-CN', '--json-path', json, '--html-path', html, '--out-dir', path.join(f.dir, 'copies')])
  expect(result.code).toBe(0); expect(JSON.parse(await readFile(json, 'utf8')).metadata.language).toBe('zh-CN')
  expect(await readFile(html, 'utf8')).toContain('lang="zh-CN"')
}))
test('date filters produce an honest empty report and reanalysis restores matching sessions', options, async () => isolated(async f => {
  const common = ['--local-only', '--data-source', 'legacy', '--stdout-json', '--out-dir', path.join(f.dir, 'out')]
  const empty = await f.cli([...common, '--since', '2026-05-01']); expect(empty.code).toBe(0); expect(JSON.parse(empty.stdout).metadata.threadCount).toBe(0)
  const all = await f.cli([...common, '--days', '0', '--reanalyze']); expect(all.code).toBe(0); expect(JSON.parse(all.stdout).metadata.threadCount).toBe(1)
}))
