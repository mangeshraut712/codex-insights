import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { __test as cliTest, runCli } from '../lib/cli.js'
import { createSampleReport } from './fixtures/sample-report.js'

test('normalizeLang collapses zh variants and defaults to en', () => {
  assert.equal(cliTest.normalizeLang('zh'), 'zh-CN')
  assert.equal(cliTest.normalizeLang('zh-Hans'), 'zh-CN')
  assert.equal(cliTest.normalizeLang('zh_CN.UTF-8'), 'zh-CN')
  assert.equal(cliTest.normalizeLang('en'), 'en')
  assert.equal(cliTest.normalizeLang('anything-else'), 'en')
})

test('detectSystemLanguage follows locale environment', () => {
  const originalOverride = process.env.CODEX_REPORT_LANG
  process.env.CODEX_REPORT_LANG = 'zh-CN'
  try {
    assert.equal(cliTest.detectSystemLanguage(), 'zh-CN')
  } finally {
    if (originalOverride === undefined) delete process.env.CODEX_REPORT_LANG
    else process.env.CODEX_REPORT_LANG = originalOverride
  }
})

test('applyScopePreset maps standard presets to expected limits', () => {
  assert.deepEqual(cliTest.applyScopePreset({}, 'lite'), {
    days: 7,
    limit: 20,
    facetLimit: 8,
    preview: 10,
  })
  assert.deepEqual(cliTest.applyScopePreset({}, 'conservative'), {
    days: 7,
    limit: 20,
    facetLimit: 8,
    preview: 10,
  })
  assert.deepEqual(cliTest.applyScopePreset({}, 'standard'), {
    limit: 200,
    facetLimit: 50,
  })
  assert.deepEqual(cliTest.applyScopePreset({}, 'deep'), {
    limit: 400,
    facetLimit: 50,
  })
})

test('parseArgs keeps explicit scope flags over preset defaults', () => {
  const parsed = cliTest.parseArgs([
    '--preset',
    'lite',
    '--days',
    '14',
    '--limit',
    '30',
    '--preview',
    '12',
    '--facet-limit',
    '9',
  ])

  assert.equal(parsed.options.preset, 'lite')
  assert.equal(parsed.options.days, 14)
  assert.equal(parsed.options.limit, 30)
  assert.equal(parsed.options.preview, 12)
  assert.equal(parsed.options.facetLimit, 9)
})

test('parseArgs accepts local data controls and validates their values', () => {
  const parsed = cliTest.parseArgs([
    '--local-only',
    '--data-source',
    'legacy',
    '--app-server-timeout',
    '2500',
  ])

  assert.equal(parsed.options.localOnly, true)
  assert.equal(parsed.options.dataSource, 'legacy')
  assert.equal(parsed.options.appServerTimeoutMs, 2500)
  assert.throws(
    () => cliTest.parseArgs(['--data-source', 'unknown']),
    /Expected auto, app-server, or legacy/,
  )
  assert.throws(
    () => cliTest.parseArgs(['--app-server-timeout', '0']),
    /positive integer/,
  )
  assert.throws(
    () => cliTest.parseArgs(['--local-only', '--estimate-only']),
    /cannot be used together/,
  )
})

test('applyQualityPreset maps balanced preset to default model plan', () => {
  assert.deepEqual(cliTest.applyQualityPreset({}, 'balanced'), {
    facetModel: 'gpt-5.4-mini',
    fastSectionModel: 'gpt-5.4-mini',
    insightModel: 'gpt-5.4',
    facetEffort: 'low',
    fastSectionEffort: 'low',
    insightEffort: 'high',
  })
})

test('buildEquivalentCommand emits a replayable command', () => {
  const command = cliTest.buildEquivalentCommand({
    days: 30,
    limit: 50,
    facetLimit: 20,
    lang: 'zh-CN',
    openReport: false,
    outDir: '/tmp/out dir',
    provider: 'codex-cli',
    facetModel: 'gpt-5.4-mini',
    fastSectionModel: 'gpt-5.4-mini',
    insightModel: 'gpt-5.4',
    facetEffort: 'low',
    fastSectionEffort: 'low',
    insightEffort: 'high',
  })

  assert.match(command, /^codex-session-insights report /)
  assert.match(command, /--lang zh-CN/)
  assert.match(command, /--no-open/)
  assert.match(command, /--out-dir '\/tmp\/out dir'/)
  assert.match(command, /--yes/)
})

test('buildEquivalentCommand omits open flags when using default behavior', () => {
  const command = cliTest.buildEquivalentCommand({
    days: 30,
    limit: 50,
    facetLimit: 20,
    lang: 'zh-CN',
    openReport: null,
    outDir: '/tmp/out',
    provider: 'codex-cli',
  })

  assert.doesNotMatch(command, /--open/)
  assert.doesNotMatch(command, /--no-open/)
})

test('buildEquivalentCommand includes include-subagents when explicitly enabled', () => {
  const command = cliTest.buildEquivalentCommand({
    days: 30,
    limit: 50,
    facetLimit: 20,
    lang: 'en',
    includeSubagents: true,
    provider: 'codex-cli',
  })

  assert.match(command, /--include-subagents/)
})

test('buildEquivalentCommand preserves deterministic data controls', () => {
  const command = cliTest.buildEquivalentCommand({
    days: 30,
    limit: 50,
    facetLimit: 20,
    lang: 'en',
    provider: 'codex-cli',
    localOnly: true,
    dataSource: 'app-server',
    appServerTimeoutMs: 2500,
  })

  assert.match(command, /--local-only/)
  assert.match(command, /--data-source app-server/)
  assert.match(command, /--app-server-timeout 2500/)
})

test('withRedactionHome uses the selected non-process Codex home for every analysis stage', () => {
  const options = cliTest.withRedactionHome(
    { provider: 'codex-cli' },
    '/Users/other/.codex',
  )

  assert.equal(options.homeDir, '/Users/other')
  assert.equal(options.provider, 'codex-cli')
})

test('runCli local-only performs zero model estimation or generation calls', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-insights-local-only-'))
  const fixture = createSampleReport()
  let writtenReport
  let receivedCollectionOptions

  await runCli(
    [
      '--local-only',
      '--data-source',
      'legacy',
      '--app-server-timeout',
      '2500',
      '--codex-home',
      tempDir,
      '--out-dir',
      tempDir,
      '--stdout-json',
      '--no-open',
    ],
    {
      collectThreadData: async options => {
        receivedCollectionOptions = options
        return {
          summaries: fixture.threads,
          coverage: {
            dataSource: 'legacy',
            discovered: 2,
            eligible: 2,
            analyzed: 2,
            excludedShort: 0,
            excludedSource: 0,
            failedToRead: 0,
            sampled: 2,
            warnings: ['Synthetic legacy source selected.'],
          },
        }
      },
      estimateLlmAnalysisCost: async () => {
        assert.fail('local-only must not estimate model analysis')
      },
      generateLlmInsights: async () => {
        assert.fail('local-only must not generate model insights')
      },
      writeReportFiles: async report => {
        writtenReport = report
        return {
          jsonPath: path.join(tempDir, 'report.json'),
          htmlPath: path.join(tempDir, 'report.html'),
          sanitizedReport: report,
        }
      },
    },
  )

  assert.equal(receivedCollectionOptions.dataSource, 'legacy')
  assert.equal(receivedCollectionOptions.appServerTimeoutMs, 2500)
  assert.equal(writtenReport.analysisMode, 'local-only')
  assert.equal(writtenReport.insights.basis, 'deterministic')
  assert.equal(writtenReport.metadata.coverage.warnings.length, 1)
})
