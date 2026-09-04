import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import {
  buildReport,
  formatReportCopyStamp,
  renderTerminalSummary,
  writeReportFiles,
} from '../lib/report.js'
import { createSampleReport } from './fixtures/sample-report.js'

function makeSummary(overrides = {}) {
  return {
    id: 'thread-1',
    title: 'Fix parser',
    firstUserMessage: 'Fix parser issue',
    cwd: '/repo/project-a',
    model: 'gpt-5.4',
    modelProvider: 'openai',
    createdAt: '2026-04-01T10:00:00.000Z',
    updatedAt: '2026-04-02T10:00:00.000Z',
    durationMinutes: 30,
    userMessages: 4,
    assistantMessages: 3,
    commentaryMessages: 2,
    finalMessages: 1,
    reasoningItems: 1,
    toolCounts: { apply_patch: 2, exec_command: 1 },
    commandKindCounts: { git_commit: 1 },
    toolFailures: { git_push: 1 },
    totalToolCalls: 3,
    totalCommandFailures: 1,
    commandFailures: [],
    commandSamples: [],
    averageCommandDurationMs: 1200,
    medianResponseTimeSeconds: 8,
    averageResponseTimeSeconds: 10,
    activeHours: [10, 11],
    userMessageTimestamps: ['2026-04-02T10:00:00.000Z'],
    transcriptForAnalysis: '[User] Fix parser',
    gitCommits: 1,
    gitPushes: 0,
    userInterruptions: 1,
    toolErrors: 1,
    toolErrorCategories: { git_push: 1 },
    usesTaskAgent: true,
    usesMcp: false,
    usesWebSearch: true,
    usesWebFetch: false,
    linesAdded: 12,
    linesRemoved: 4,
    filesModified: 2,
    tokenUsage: {
      inputTokens: 120,
      cachedInputTokens: 30,
      outputTokens: 22,
      reasoningOutputTokens: 5,
      totalTokens: 177,
    },
    ...overrides,
  }
}

test('buildReport aggregates summary metrics and terminal output', () => {
  const report = buildReport(
    [
      makeSummary(),
      makeSummary({
        id: 'thread-2',
        cwd: '/repo/project-b',
        model: 'gpt-5.3-codex-spark',
        createdAt: '2026-04-03T10:00:00.000Z',
        updatedAt: '2026-04-04T10:00:00.000Z',
        totalCommandFailures: 0,
        toolFailures: {},
        toolErrorCategories: {},
        totalToolCalls: 1,
        toolCounts: { 'web.search_query': 1 },
        commandKindCounts: {},
        userMessageTimestamps: ['2026-04-04T10:00:00.000Z'],
        tokenUsage: {
          inputTokens: 80,
          cachedInputTokens: 0,
          outputTokens: 10,
          reasoningOutputTokens: 0,
          totalTokens: 90,
        },
      }),
    ],
    {
      codexHome: '/tmp/.codex',
      coverage: {
        dataSource: 'app-server',
        discovered: 4,
        eligible: 3,
        analyzed: 2,
        excludedShort: 1,
        excludedSource: 1,
        failedToRead: 0,
        sampled: 3,
        warnings: [],
      },
      days: 30,
      threadPreviewLimit: 10,
      insightsOverride: {
        at_a_glance: {
          whats_working: 'Strong editing loops.',
          whats_hindering: 'A few failed pushes.',
          quick_wins: 'Add more repo memory.',
          ambitious_workflows: 'Try parallel agents.',
        },
      },
      facets: [],
    },
  )

  report.analysisUsage = {
    calls: 5,
    inputTokens: 1000,
    cachedInputTokens: 200,
    outputTokens: 100,
    totalTokens: 1300,
    byModel: [],
    byStage: [],
  }
  report.analysisEstimate = {
    estimatedTotalTokens: 1200,
    estimatedRange: { low: 1000, high: 1600 },
  }

  assert.equal(report.metadata.threadCount, 2)
  assert.equal(report.metadata.coverage.dataSource, 'app-server')
  assert.equal(report.schemaVersion, 2)
  assert.equal(report.privacy.redactions, 0)
  assert.equal(report.summary.totalUserMessages, 8)
  assert.equal(report.summary.totalTokens, 267)
  assert.equal(report.summary.sessionsUsingTaskAgent, 2)
  assert.equal(report.charts.projects[0].value, 1)

  const terminal = renderTerminalSummary(report)
  assert.match(terminal, /Codex Insights/)
  assert.match(terminal, /2 sessions \(4 total\)/)
  assert.match(terminal, /Analysis cost: 1.3K tokens across 5 model calls/)
  assert.match(terminal, /Estimate vs Actual: 1.2K tokens -> 0.9K tokens \(fresh\)/)
  assert.match(terminal, /Top Projects:/)
  assert.match(terminal, /Model Mix:/)
  assert.match(terminal, /Trust & Coverage/)
  assert.match(terminal, /source=app-server/)
  assert.match(terminal, /discovered=4/)
})

test('writeReportFiles writes JSON and HTML outputs', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-session-insights-test-'))
  const report = buildReport([makeSummary()], {
    insightsOverride: {
      at_a_glance: {
        whats_working: 'Strong editing loops.',
        whats_hindering: 'A few failed pushes.',
        quick_wins: 'Add more repo memory.',
        ambitious_workflows: 'Try parallel agents.',
      },
      project_areas: { areas: [] },
      interaction_style: { narrative: 'You iterate quickly.', key_pattern: 'Fast refinement' },
      what_works: { intro: 'Good flow.', impressive_workflows: [] },
      friction_analysis: { intro: 'Some friction.', categories: [] },
      suggestions: {
        agents_md_additions: [
          {
            addition: 'Capture repo release rules in AGENTS.md.',
            why: 'This removes repeated context restatement.',
            prompt_scaffold: 'Add under a Release section.',
          },
        ],
        features_to_try: [
          {
            feature: 'Skills',
            one_liner: 'Reusable repo workflows.',
            why_for_you: 'You repeat the same validation flow.',
            example_code: 'Create a release-readiness skill and run it before publish.',
          },
        ],
        usage_patterns: [
          {
            title: 'Scope-lock release changes',
            suggestion: 'Start by inspecting the publish boundary.',
            detail: 'This prevents late cleanup.',
            copyable_prompt: 'Inspect package.json, README, and publish files first.',
          },
        ],
      },
      on_the_horizon: {
        intro: 'More automation.',
        opportunities: [
          {
            title: 'Parallel release prep',
            whats_possible: 'Split docs and package validation.',
            how_to_try: 'Use sub-agents for bounded parallel passes.',
            copyable_prompt: 'Spawn one worker for docs and one for package metadata.',
          },
        ],
      },
      fun_ending: { headline: 'A good save', detail: 'Recovered a broken patch.' },
    },
    facets: [],
  })
  report.analysisUsage = {
    calls: 3,
    inputTokens: 900,
    cachedInputTokens: 100,
    outputTokens: 80,
    totalTokens: 1080,
    byModel: [],
    byStage: [],
  }
  report.analysisEstimate = {
    estimatedTotalTokens: 1000,
    estimatedRange: { low: 800, high: 1350 },
  }

  const { jsonPath, htmlPath, archiveHtmlPath, archiveJsonPath } = await writeReportFiles(report, {
    outDir: tempDir,
  })
  const html = await fs.readFile(htmlPath, 'utf8')
  const json = JSON.parse(await fs.readFile(jsonPath, 'utf8'))
  const stamp = formatReportCopyStamp(json.metadata.generatedAt)

  assert.match(html, /At a Glance/)
  assert.match(html, /Strong editing loops\./)
  assert.match(html, /Copy All Checked/)
  assert.match(html, /Paste into Codex:/)
  assert.match(html, /Estimate vs Actual/)
  assert.equal(json.insights.at_a_glance.quick_wins, 'Add more repo memory.')
  assert.equal(path.basename(archiveHtmlPath), `report-${stamp}.html`)
  assert.equal(path.basename(archiveJsonPath), `report-${stamp}.json`)
  assert.equal(await fs.readFile(archiveHtmlPath, 'utf8'), html)
  assert.equal(JSON.parse(await fs.readFile(archiveJsonPath, 'utf8')).schemaVersion, 2)
})

test('local-only HTML labels deterministic analysis and renders coverage warnings', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-insights-trust-'))
  const report = createSampleReport()
  report.analysisMode = 'local-only'
  report.provider = null
  report.analysisUsage = null
  report.analysisEstimate = null
  report.insights.basis = 'deterministic'
  report.insights.at_a_glance.basis = 'deterministic'
  report.metadata.coverage = {
    dataSource: 'legacy',
    discovered: 8,
    eligible: 6,
    analyzed: 4,
    excludedShort: 1,
    excludedSource: 1,
    failedToRead: 1,
    sampled: 5,
    warnings: ['Codex app-server unavailable; used legacy SQLite/rollout reader.'],
  }

  const { htmlPath, jsonPath } = await writeReportFiles(report, { outDir: tempDir })
  const html = await fs.readFile(htmlPath, 'utf8')
  const json = JSON.parse(await fs.readFile(jsonPath, 'utf8'))
  const terminal = renderTerminalSummary(report)

  assert.match(html, /Trust &amp; Coverage/)
  assert.match(html, /Local-only/)
  assert.match(html, /Deterministic/)
  assert.match(html, /Codex app-server unavailable/)
  assert.match(html, /4 sessions \(8 total\)/)
  assert.match(html, /Very short sessions were skipped\./)
  assert.match(terminal, /warning: Codex app-server unavailable/)
  assert.match(terminal, /4 sessions \(8 total\)/)
  assert.equal(json.analysisMode, 'local-only')
  assert.equal(json.metadata.coverage.failedToRead, 1)
  assert.equal(json.insights.basis, 'deterministic')
})

test('sample report fixture generates stable HTML output', async () => {
  const firstDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-session-insights-sample-a-'))
  const secondDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-session-insights-sample-b-'))

  const first = await writeReportFiles(createSampleReport(), { outDir: firstDir })
  const second = await writeReportFiles(createSampleReport(), { outDir: secondDir })

  const firstHtml = await fs.readFile(first.htmlPath, 'utf8')
  const secondHtml = await fs.readFile(second.htmlPath, 'utf8')

  assert.equal(firstHtml, secondHtml)
  assert.match(firstHtml, /The report started testing itself/)
  assert.match(firstHtml, /Snapshot report validation/)
  assert.match(firstHtml, /Existing Codex Features to Try/)
})

test('writeReportFiles redacts final JSON and HTML boundaries', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-session-insights-redacted-'))
  const homeDir = '/Users/synthetic-analyst'
  const secret = 'sk-proj-SYNTHETICREPORTSECRET1234567890'
  const report = createSampleReport()
  report.metadata.codexHome = `${homeDir}/.codex`
  report.insights.at_a_glance.whats_working = `Used ${secret}`

  const { jsonPath, htmlPath, sanitizedReport } = await writeReportFiles(report, {
    outDir: tempDir,
    homeDir,
  })
  const serialized = `${await fs.readFile(jsonPath, 'utf8')}\n${await fs.readFile(htmlPath, 'utf8')}`

  assert.doesNotMatch(serialized, new RegExp(homeDir))
  assert.doesNotMatch(serialized, new RegExp(secret))
  assert.match(serialized, /\[REDACTED_HOME\]/)
  assert.match(serialized, /\[REDACTED_API_KEY\]/)
  assert.doesNotMatch(JSON.stringify(sanitizedReport), new RegExp(homeDir))
  assert.doesNotMatch(JSON.stringify(sanitizedReport), new RegExp(secret))
})

test('writeReportFiles keeps the latest report and deletes copies older than 30 days', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-insights-archive-'))
  const staleHtml = path.join(tempDir, 'report-2026-02-01T120000Z.html')
  const staleJson = path.join(tempDir, 'report-2026-02-01T120000Z.json')
  await fs.writeFile(staleHtml, '<html>stale</html>', 'utf8')
  await fs.writeFile(staleJson, '{"stale":true}', 'utf8')

  const report = createSampleReport()
  report.metadata.generatedAt = '2026-04-04T12:00:00.000Z'
  const { htmlPath, archiveHtmlPath } = await writeReportFiles(report, {
    outDir: tempDir,
    now: '2026-04-04T12:00:00.000Z',
    retentionDays: 30,
  })

  await assert.rejects(fs.access(staleHtml), { code: 'ENOENT' })
  await assert.rejects(fs.access(staleJson), { code: 'ENOENT' })
  await fs.access(htmlPath)
  await fs.access(archiveHtmlPath)
  assert.equal(path.basename(archiveHtmlPath), 'report-2026-04-04T120000Z.html')
})
