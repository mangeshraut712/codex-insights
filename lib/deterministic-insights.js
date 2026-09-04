import path from 'node:path'

/**
 * Build conservative narrative sections from report metrics without a model call.
 * The output matches the renderer's insight shape while avoiding judgments that
 * cannot be established from counters alone.
 *
 * @param {any} report
 */
export function buildDeterministicInsights(report) {
  const threadCount = Number(report.metadata?.threadCount || 0)
  const failures = Number(report.summary?.totalFailures || 0)
  const toolErrors = Number(report.summary?.totalToolErrors || 0)
  const topProject = report.charts?.projects?.[0]
  const topProjectName = projectName(topProject?.label)
  const projectShare = threadCount > 0 ? Number(topProject?.value || 0) / threadCount : 0
  const capabilityNames = (report.charts?.capabilities || [])
    .slice(0, 3)
    .map(item => item.label)
  const failureCategories = [
    ...(report.charts?.toolFailures || []),
    ...(report.charts?.toolErrorCategories || []),
  ]
  const frictionCategories = uniqueByLabel(failureCategories)
    .slice(0, 3)
    .map(item => ({
      category: item.label,
      description: `${formatCount(item.value, 'recorded event')} in the analyzed sessions.`,
      examples: [],
    }))

  const analysisLimit =
    'This local-only analysis reports observable counts and does not infer goal completion, user satisfaction, or code quality.'
  const capabilitySummary = capabilityNames.length
    ? `Observed capability signals include ${joinWords(capabilityNames)}.`
    : 'No optional capability signals were detected in the analyzed sessions.'
  const concentrationSummary = topProject
    ? `${formatCount(topProject.value, 'session')} mapped to ${topProjectName}${projectShare >= 0.75 ? ', so this report is concentrated in that project' : ''}.`
    : 'No project concentration could be calculated.'
  const failureSummary =
    failures || toolErrors
      ? `${formatCount(failures, 'command failure')} and ${formatCount(toolErrors, 'tool error')} were recorded.`
      : 'No command or tool failures were recorded.'

  return {
    basis: 'deterministic',
    at_a_glance: {
      basis: 'deterministic',
      whats_working: `${formatCount(threadCount, 'substantive session')} were analyzed. ${capabilitySummary}`,
      whats_hindering: `${failureSummary} Counts alone do not establish their impact on outcomes.`,
      quick_wins: 'Review the failure and project-distribution sections before changing your workflow.',
      ambitious_workflows: 'Run model-assisted analysis only if you want interpretations beyond these local metrics.',
    },
    project_areas: {
      basis: 'deterministic',
      areas: (report.charts?.projects || []).slice(0, 4).map(item => ({
        name: projectName(item.label),
        session_count: Number(item.value || 0),
        description: `${formatCount(item.value, 'analyzed session')} associated with this project path.`,
      })),
    },
    interaction_style: {
      basis: 'deterministic',
      narrative: `${concentrationSummary} ${analysisLimit}`,
      key_pattern: 'Only directly observed session distribution and activity counts are included.',
    },
    what_works: {
      basis: 'deterministic',
      intro: 'Local-only mode does not classify outcomes as successful.',
      impressive_workflows: capabilityNames.map(name => ({
        title: name,
        description: `This capability appeared in the analyzed session metrics; its effectiveness was not inferred.`,
      })),
    },
    friction_analysis: {
      basis: 'deterministic',
      intro: `${failureSummary} Local-only mode does not infer root causes.`,
      categories: frictionCategories,
    },
    suggestions: {
      basis: 'deterministic',
      agents_md_additions: [],
      features_to_try: [],
      usage_patterns: [],
    },
    on_the_horizon: {
      basis: 'deterministic',
      intro: 'Future workflow recommendations require interpretation and are omitted in local-only mode.',
      opportunities: [],
    },
    fun_ending: {
      basis: 'deterministic',
      headline: 'Local facts, explicit limits',
      detail: 'No model interpreted these sessions; every statement above comes from deterministic report metrics.',
    },
  }
}

function projectName(value) {
  const normalized = String(value || '').replaceAll('\\', '/')
  return path.posix.basename(normalized) || '(unknown project)'
}

function formatCount(value, noun) {
  const count = Number(value || 0)
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function joinWords(values) {
  if (values.length === 1) return values[0]
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
}

function uniqueByLabel(items) {
  const seen = new Set()
  return items.filter(item => {
    if (!item?.label || seen.has(item.label)) return false
    seen.add(item.label)
    return true
  })
}
