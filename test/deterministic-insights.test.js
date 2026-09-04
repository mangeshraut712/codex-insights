import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDeterministicInsights } from '../lib/deterministic-insights.js'
import { createSampleReport } from './fixtures/sample-report.js'

test('buildDeterministicInsights derives conservative sections from report metrics', () => {
  const report = createSampleReport()
  const insights = buildDeterministicInsights(report)

  assert.equal(insights.basis, 'deterministic')
  assert.equal(insights.at_a_glance.basis, 'deterministic')
  assert.match(insights.at_a_glance.whats_working, /2 substantive sessions/)
  assert.match(insights.at_a_glance.whats_hindering, /command failure/)
  assert.equal(insights.project_areas.areas[0].name, 'codex-session-insights')
  assert.ok(insights.friction_analysis.categories.length > 0)
  assert.deepEqual(insights.suggestions.agents_md_additions, [])
  assert.deepEqual(insights.suggestions.features_to_try, [])
  assert.deepEqual(insights.suggestions.usage_patterns, [])
})

test('buildDeterministicInsights states limitations instead of inferring outcomes', () => {
  const report = createSampleReport()
  report.summary.totalFailures = 0
  report.summary.totalToolErrors = 0
  report.charts.toolFailures = []
  report.charts.toolErrorCategories = []

  const insights = buildDeterministicInsights(report)

  assert.match(insights.friction_analysis.intro, /No command or tool failures were recorded/)
  assert.match(insights.interaction_style.narrative, /does not infer goal completion/)
  assert.match(insights.fun_ending.detail, /No model interpreted/)
})

test('buildDeterministicInsights uses singular grammar for one analyzed session', () => {
  const report = createSampleReport()
  report.metadata.threadCount = 1

  const insights = buildDeterministicInsights(report)

  assert.match(insights.at_a_glance.whats_working, /^1 substantive session was analyzed\./)
})
