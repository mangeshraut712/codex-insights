import path from 'node:path'
import { spawn } from 'node:child_process'
import { confirm, input, select } from '@inquirer/prompts'
import ora from 'ora'
import { collectThreadData, resolveCodexHome } from './codex-data.js'
import { buildDeterministicInsights } from './deterministic-insights.js'
import { buildReport, cleanupExpiredReportCopies, renderTerminalSummary, writeReportFiles } from './report.js'
import { estimateLlmAnalysisCost, generateLlmInsights } from './llm-insights.js'
import { persistAnalyzedSessions } from './seen-sessions.js'
import { buildAccountProfile, buildPublicProfile, writeProfileSite } from './profile.js'
import { collectAccountProfile } from './account-profile.js'
import { compareVersions, selfUpdate } from './auto-update.js'
import { publishProfileSite, validateRepoSlug, validateSiteDir } from './publish.js'
import { installSchedule, readScheduleStatus, removeSchedule } from './schedule.js'
import { PACKAGE_VERSION } from './version.js'
import { promises as fs } from 'node:fs'

const DEFAULT_SCOPE_PRESET = 'standard'
const DEFAULT_QUALITY_PRESET = 'balanced'

export async function runCli(argv, dependencies = {}) {
  const parsed = parseArgs(argv)
  const progress = createProgressUi(parsed.options)
  const collectThreads = dependencies.collectThreadData ?? collectThreadData
  const estimateAnalysis = dependencies.estimateLlmAnalysisCost ?? estimateLlmAnalysisCost
  const generateInsights = dependencies.generateLlmInsights ?? generateLlmInsights
  const writeFiles = dependencies.writeReportFiles ?? writeReportFiles
  const persistSeen = dependencies.persistAnalyzedSessions ?? persistAnalyzedSessions
  const cleanupCopies = dependencies.cleanupExpiredReportCopies ?? cleanupExpiredReportCopies
  const collectAccount = dependencies.collectAccountProfile ?? collectAccountProfile

  if (parsed.help) {
    printHelp()
    return
  }
  if (parsed.version) {
    process.stdout.write(`${PACKAGE_VERSION}\n`)
    return
  }

  const command = parsed.command ?? 'report'
  if (!['report', 'profile', 'auto', 'schedule'].includes(command)) throw new Error(`Unsupported command "${command}".`)

  if (command === 'profile') {
    await runProfileCommand(parsed.options, collectAccount)
    return
  }
  if (command === 'auto') {
    await runAutoCommand(argv, parsed.options, {
      collectAccount,
      selfUpdate: dependencies.selfUpdate ?? selfUpdate,
      publish: dependencies.publishProfileSite ?? publishProfileSite,
      rerun: dependencies.rerunCli ?? rerunCli,
    })
    return
  }
  if (command === 'schedule') {
    await runScheduleCommand(parsed.subcommand, parsed.options, {
      install: dependencies.installSchedule ?? installSchedule,
      remove: dependencies.removeSchedule ?? removeSchedule,
      status: dependencies.readScheduleStatus ?? readScheduleStatus,
    })
    return
  }

  const codexHome = resolveCodexHome(parsed.options.codexHome)
  parsed.options = withRedactionHome(parsed.options, codexHome)
  let outDir = path.resolve(parsed.options.outDir ?? path.join(codexHome, 'usage-data'))
  await cleanupCopies(outDir)
  let threadSummaries
  let collection
  let estimate

  if (shouldUseInteractiveMode(parsed.options)) {
    const wizardResult = await runInteractiveWizard({
      options: parsed.options,
      codexHome,
      defaultOutDir: outDir,
      progress,
      collectThreads,
      estimateAnalysis,
    })
    if (!wizardResult) return
    parsed.options = wizardResult.options
    threadSummaries = wizardResult.threadSummaries
    collection = wizardResult.collection
    estimate = wizardResult.estimate
    outDir = path.resolve(parsed.options.outDir ?? outDir)
  }

  const sinceEpochSeconds = resolveSinceEpochSeconds(parsed.options)
  const cacheDir = parsed.options.cacheDir
    ? path.resolve(parsed.options.cacheDir)
    : undefined

  if (!threadSummaries) {
    progress.startStage(parsed.options, getUiText(parsed.options.lang).loadingIndex)
    collection = await collectThreads(
      buildCollectOptions(parsed.options, {
        codexHome,
        sinceEpochSeconds,
        cacheDir,
        usageDataDir: outDir,
      }),
    )
    threadSummaries = collection.summaries
    progress.completeStage(parsed.options, getUiText(parsed.options.lang).loadingIndex)
  }

  if (!parsed.options.localOnly && !estimate) {
    progress.startStage(parsed.options, getUiText(parsed.options.lang).estimating)
    estimate = await estimateAnalysis({
      threadSummaries,
      options: parsed.options,
    })
    progress.completeStage(parsed.options, getUiText(parsed.options.lang).estimating)
  }

  if (!parsed.options.localOnly && !parsed.options.stdoutJson) {
    process.stdout.write(`${renderEstimateSummary(estimate, parsed.options.lang)}\n\n`)
  }

  if (parsed.options.estimateOnly) {
    return
  }

  let report
  if (parsed.options.localOnly) {
    report = buildReport(threadSummaries, {
      codexHome,
      days: parsed.options.since ? null : parsed.options.days,
      since: parsed.options.since,
      lang: parsed.options.lang,
      threadPreviewLimit: parsed.options.preview,
      coverage: collection?.coverage,
      analysisMode: 'local-only',
    })
    report.insights = buildDeterministicInsights(report)
    report.analysisMode = 'local-only'
    report.provider = null
  } else {
    progress.startStage(parsed.options, getUiText(parsed.options.lang).generating)
    const llmResult = await generateInsights({
      threadSummaries,
      options: {
        ...parsed.options,
        onProgress: event => progress.updateFromEvent(parsed.options, event),
      },
    })
    progress.completeStage(parsed.options, getUiText(parsed.options.lang).generating)

    report = buildReport(llmResult.reportThreads, {
      codexHome,
      days: parsed.options.since ? null : parsed.options.days,
      since: parsed.options.since,
      lang: parsed.options.lang,
      threadPreviewLimit: parsed.options.preview,
      insightsOverride: { ...llmResult.insights, basis: 'model' },
      facets: llmResult.facets,
      coverage: collection?.coverage,
      analysisMode: 'model-assisted',
    })
    report.analysisMode = 'model-assisted'
    report.provider = parsed.options.provider
    report.analysisEstimate = estimate
    report.analysisUsage = llmResult.analysisUsage
    report.metadata.facetSelection = llmResult.facetSelection
  }

  progress.startStage(parsed.options, getUiText(parsed.options.lang).writingFiles)
  const { jsonPath, htmlPath, sanitizedReport } = await writeFiles(report, {
    outDir,
    jsonPath: parsed.options.jsonPath ? path.resolve(parsed.options.jsonPath) : undefined,
    htmlPath: parsed.options.htmlPath ? path.resolve(parsed.options.htmlPath) : undefined,
    homeDir: parsed.options.homeDir,
  })
  await persistSeen(outDir, threadSummaries, { alsoSeen: collection?.seenEntries })
  progress.completeStage(parsed.options, getUiText(parsed.options.lang).writingFiles)

  if (parsed.options.stdoutJson) {
    process.stdout.write(`${JSON.stringify(sanitizedReport, null, 2)}\n`)
    return
  }

  process.stdout.write(`${renderTerminalSummary(report)}\n\n`)
  process.stdout.write(`JSON: ${jsonPath}\n`)
  process.stdout.write(`HTML: ${htmlPath}\n`)

  const shouldOpen = resolveShouldOpenReport(parsed.options)
  if (shouldOpen) {
    progress.startStage(parsed.options, getUiText(parsed.options.lang).openingBrowser)
    const opened = await openReportInBrowser(htmlPath)
    if (opened) {
      progress.completeStage(parsed.options, getUiText(parsed.options.lang).openingBrowser)
      process.stdout.write(`${getUiText(parsed.options.lang).openedInBrowser}\n`)
      return
    }
    progress.failStage(parsed.options, getUiText(parsed.options.lang).openingBrowser)
  }

  process.stdout.write(`${getUiText(parsed.options.lang).openHint}: ${formatOpenHint(htmlPath)}\n`)
}

async function runProfileCommand(options, collectAccount) {
  const codexHome = resolveCodexHome(options.codexHome)
  const outDir = path.resolve(options.outDir ?? path.join(codexHome, 'usage-data', 'profile'))
  const identity = { name: options.profileName, handle: options.profileHandle }
  let profile = null
  let accountWarning = ''

  if (options.profileSource !== 'local') {
    try {
      const account = await collectAccount({
        codexHome,
        codexBin: options.codexBin,
        appServerTimeoutMs: options.appServerTimeoutMs,
      })
      profile = buildAccountProfile(account, identity)
      accountWarning = account.warning
    } catch (error) {
      if (options.profileSource === 'account') throw new Error(`Cannot read Codex account stats: ${error.message}`)
      process.stderr.write(`Account stats unavailable (${error.message}); using the local report instead.\n`)
    }
  }

  if (!profile) {
    const reportPath = path.resolve(options.reportJson ?? path.join(codexHome, 'usage-data', 'report.json'))
    let report
    try { report = JSON.parse(await fs.readFile(reportPath, 'utf8')) }
    catch (error) { throw new Error(`Cannot read report JSON at ${reportPath}: ${error.message}`) }
    profile = buildPublicProfile(report, identity)
  }

  const { htmlPath, jsonPath } = await writeProfileSite(profile, { outDir })
  if (accountWarning) process.stderr.write(`${accountWarning}\n`)
  process.stdout.write(`Profile (${profile.source === 'account' ? 'Codex account stats' : 'local report'}): ${htmlPath}\nData: ${jsonPath}\nReview both files before publishing. See docs/shareable-profile.md for GitHub Pages steps.\n`)
}

async function runAutoCommand(argv, options, deps) {
  const log = message => process.stdout.write(`[${new Date().toISOString()}] ${message}\n`)
  log(`Codex Insights ${PACKAGE_VERSION}: automatic refresh`)
  if (options.selfUpdate) {
    try {
      const result = await deps.selfUpdate({ currentVersion: PACKAGE_VERSION })
      if (result.updated) {
        log(`Updated the CLI and $insights skill to ${result.latest}; continuing with the new version.`)
        await deps.rerun([...argv, '--no-self-update'])
        return
      }
      log(`CLI and $insights skill are up to date (${PACKAGE_VERSION}).`)
    } catch (error) {
      log(`Update check skipped: ${error.message}`)
    }
  }

  await runProfileCommand({ ...options, profileSource: 'account' }, deps.collectAccount)
  if (!options.publishRepo) return

  const codexHome = resolveCodexHome(options.codexHome)
  const profileDir = path.resolve(options.outDir ?? path.join(codexHome, 'usage-data', 'profile'))
  const result = await deps.publish({
    profileDir,
    repo: options.publishRepo,
    siteDir: options.siteDir,
    branch: options.branch,
    workDir: path.join(codexHome, 'usage-data', 'profile-publish', options.publishRepo.replace('/', '__')),
  })
  log(result.changed ? `Published the updated profile to ${options.publishRepo} (${options.siteDir}/).` : 'Profile stats unchanged; nothing to publish.')
}

function rerunCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [process.argv[1], ...args], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', code => {
      if (code) process.exitCode = code
      resolve()
    })
  })
}

async function runScheduleCommand(subcommand, options, deps) {
  switch (subcommand) {
    case 'install': {
      if (compareVersions(process.versions.node, '18.17.0') < 0) {
        throw new Error(`Node ${process.versions.node} is too old for scheduled runs. Install Node 18.17 or newer and rerun this command with it.`)
      }
      const autoArgs = [
        ...(options.publishRepo ? ['--repo', options.publishRepo, '--site-dir', options.siteDir, '--branch', options.branch] : []),
        ...(options.profileName ? ['--name', options.profileName] : []),
        ...(options.profileHandle ? ['--handle', options.profileHandle] : []),
        ...(options.selfUpdate ? [] : ['--no-self-update']),
      ]
      const { plistPath, logPath } = await deps.install({
        nodePath: process.execPath,
        cliPath: path.resolve(process.argv[1]),
        autoArgs,
        intervalHours: options.everyHours,
      })
      process.stdout.write([
        `Scheduled every ${options.everyHours}h and once now: update the CLI and $insights skill, refresh the profile${options.publishRepo ? `, publish to ${options.publishRepo}` : ''}.`,
        `Agent: ${plistPath}`,
        `Log:   ${logPath}`,
        'Check with: codex-session-insights schedule status',
      ].join('\n') + '\n')
      return
    }
    case 'remove': {
      const { plistPath } = await deps.remove()
      process.stdout.write(`Removed the scheduled refresh (${plistPath}).\n`)
      return
    }
    case 'status': {
      const status = await deps.status()
      process.stdout.write(status.installed
        ? `Scheduled every ${status.intervalHours}h.\nAgent: ${status.plistPath}\nLog:   ${status.logPath}\n${status.recentLog ? `\nRecent log:\n${status.recentLog}\n` : ''}`
        : 'No scheduled refresh. Set one up with: codex-session-insights schedule install --repo owner/name\n')
      return
    }
    default:
      throw new Error('Usage: codex-session-insights schedule install|status|remove')
  }
}

function normalizeProfileSource(value) {
  if (['auto', 'account', 'local'].includes(value)) return value
  throw new Error(`Invalid --source "${value}". Expected auto, account, or local.`)
}

function parseArgs(argv) {
  let command = null
  let subcommand = null
  const explicit = {
    days: false,
    limit: false,
    preview: false,
    facetLimit: false,
  }
  const options = {
    codexHome: null,
    outDir: null,
    jsonPath: null,
    htmlPath: null,
    preset: DEFAULT_SCOPE_PRESET,
    days: 30,
    since: null,
    limit: 200,
    preview: 50,
    provider: 'codex-cli',
    codexBin: null,
    apiBase: null,
    apiKey: null,
    facetModel: null,
    facetEffort: null,
    fastSectionModel: null,
    fastSectionEffort: null,
    insightModel: null,
    insightEffort: null,
    cacheDir: null,
    facetLimit: 50,
    lang: detectSystemLanguage(),
    includeArchived: false,
    includeSubagents: false,
    reanalyze: false,
    stdoutJson: false,
    estimateOnly: false,
    localOnly: false,
    dataSource: 'auto',
    appServerTimeoutMs: 10_000,
    openReport: null,
    yes: false,
    nonInteractive: false,
    reportJson: null,
    profileName: null,
    profileHandle: null,
    profileSource: 'auto',
    publishRepo: null,
    siteDir: 'docs',
    branch: 'main',
    everyHours: 12,
    selfUpdate: true,
  }
  let help = false
  let version = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]

    if (!arg.startsWith('-') && command === null) {
      command = arg
      continue
    }
    if (!arg.startsWith('-') && command === 'schedule' && subcommand === null) {
      subcommand = arg
      continue
    }

    if (arg === '-h' || arg === '--help') {
      help = true
      continue
    }
    if (arg === '-V' || arg === '--version') {
      version = true
      continue
    }
    if (arg === '--codex-home') {
      options.codexHome = requireValue(argv, ++i, '--codex-home')
      continue
    }
    if (arg === '--out-dir') {
      options.outDir = requireValue(argv, ++i, '--out-dir')
      continue
    }
    if (arg === '--report-json') {
      options.reportJson = requireValue(argv, ++i, '--report-json')
      continue
    }
    if (arg === '--name') {
      options.profileName = requireValue(argv, ++i, '--name')
      continue
    }
    if (arg === '--repo') {
      options.publishRepo = validateRepoSlug(requireValue(argv, ++i, '--repo'))
      continue
    }
    if (arg === '--site-dir') {
      options.siteDir = validateSiteDir(requireValue(argv, ++i, '--site-dir'))
      continue
    }
    if (arg === '--branch') {
      options.branch = requireValue(argv, ++i, '--branch')
      if (!/^[A-Za-z0-9._/-]+$/.test(options.branch)) throw new Error(`Invalid --branch "${options.branch}".`)
      continue
    }
    if (arg === '--every') {
      options.everyHours = toPositiveNonzeroInt(requireValue(argv, ++i, '--every'), '--every')
      continue
    }
    if (arg === '--no-self-update') {
      options.selfUpdate = false
      continue
    }
    if (arg === '--source') {
      options.profileSource = normalizeProfileSource(requireValue(argv, ++i, '--source'))
      continue
    }
    if (arg === '--handle') {
      options.profileHandle = requireValue(argv, ++i, '--handle')
      continue
    }
    if (arg === '--json-path') {
      options.jsonPath = requireValue(argv, ++i, '--json-path')
      continue
    }
    if (arg === '--html-path') {
      options.htmlPath = requireValue(argv, ++i, '--html-path')
      continue
    }
    if (arg === '--since') {
      options.since = requireValue(argv, ++i, '--since')
      parseSinceDate(options.since)
      continue
    }
    if (arg === '--days') {
      explicit.days = true
      options.days = toPositiveInt(requireValue(argv, ++i, '--days'), '--days')
      continue
    }
    if (arg === '--preset') {
      options.preset = normalizeScopePreset(requireValue(argv, ++i, '--preset'))
      continue
    }
    if (arg === '--limit') {
      explicit.limit = true
      options.limit = toPositiveInt(requireValue(argv, ++i, '--limit'), '--limit')
      continue
    }
    if (arg === '--preview') {
      explicit.preview = true
      options.preview = toPositiveInt(requireValue(argv, ++i, '--preview'), '--preview')
      continue
    }
    if (arg === '--provider') {
      options.provider = requireValue(argv, ++i, '--provider')
      continue
    }
    if (arg === '--codex-bin') {
      options.codexBin = requireValue(argv, ++i, '--codex-bin')
      continue
    }
    if (arg === '--api-base') {
      options.apiBase = requireValue(argv, ++i, '--api-base')
      continue
    }
    if (arg === '--api-key') {
      options.apiKey = requireValue(argv, ++i, '--api-key')
      continue
    }
    if (arg === '--facet-model') {
      options.facetModel = requireValue(argv, ++i, '--facet-model')
      continue
    }
    if (arg === '--facet-effort') {
      options.facetEffort = requireValue(argv, ++i, '--facet-effort')
      continue
    }
    if (arg === '--fast-section-model') {
      options.fastSectionModel = requireValue(argv, ++i, '--fast-section-model')
      continue
    }
    if (arg === '--fast-section-effort') {
      options.fastSectionEffort = requireValue(argv, ++i, '--fast-section-effort')
      continue
    }
    if (arg === '--insight-model') {
      options.insightModel = requireValue(argv, ++i, '--insight-model')
      continue
    }
    if (arg === '--insight-effort') {
      options.insightEffort = requireValue(argv, ++i, '--insight-effort')
      continue
    }
    if (arg === '--cache-dir') {
      options.cacheDir = requireValue(argv, ++i, '--cache-dir')
      continue
    }
    if (arg === '--lang') {
      options.lang = normalizeLang(requireValue(argv, ++i, '--lang'))
      continue
    }
    if (arg === '--facet-limit') {
      explicit.facetLimit = true
      options.facetLimit = toPositiveInt(requireValue(argv, ++i, '--facet-limit'), '--facet-limit')
      continue
    }
    if (arg === '--include-archived') {
      options.includeArchived = true
      continue
    }
    if (arg === '--include-subagents') {
      options.includeSubagents = true
      continue
    }
    if (arg === '--reanalyze') {
      options.reanalyze = true
      continue
    }
    if (arg === '--stdout-json') {
      options.stdoutJson = true
      continue
    }
    if (arg === '--estimate-only') {
      options.estimateOnly = true
      continue
    }
    if (arg === '--local-only') {
      options.localOnly = true
      continue
    }
    if (arg === '--data-source') {
      options.dataSource = normalizeDataSource(requireValue(argv, ++i, '--data-source'))
      continue
    }
    if (arg === '--app-server-timeout') {
      options.appServerTimeoutMs = toPositiveNonzeroInt(
        requireValue(argv, ++i, '--app-server-timeout'),
        '--app-server-timeout',
      )
      continue
    }
    if (arg === '--open') {
      options.openReport = true
      continue
    }
    if (arg === '--no-open') {
      options.openReport = false
      continue
    }
    if (arg === '--yes') {
      options.yes = true
      continue
    }
    if (arg === '--non-interactive') {
      options.nonInteractive = true
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!['codex-cli', 'openai'].includes(options.provider)) {
    throw new Error(`Invalid provider "${options.provider}". Expected codex-cli or openai.`)
  }
  if (options.since && explicit.days) {
    throw new Error('--since and --days cannot be used together.')
  }
  if (options.localOnly && options.estimateOnly) {
    throw new Error('--local-only and --estimate-only cannot be used together.')
  }

  options.preset = normalizeScopePreset(options.preset)
  const explicitValues = {
    days: options.days,
    limit: options.limit,
    preview: options.preview,
    facetLimit: options.facetLimit,
  }
  Object.assign(options, applyScopePreset(options, options.preset))
  if (explicit.days) options.days = explicitValues.days
  if (explicit.limit) options.limit = explicitValues.limit
  if (explicit.preview) options.preview = explicitValues.preview
  if (explicit.facetLimit) options.facetLimit = explicitValues.facetLimit

  return { command, subcommand, options, help, version }
}

function requireValue(argv, index, flag) {
  const value = argv[index]
  if (!value) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

function toPositiveInt(value, flag) {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${flag} must be a non-negative integer`)
  }
  return number
}

function toPositiveNonzeroInt(value, flag) {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${flag} must be a positive integer`)
  }
  return number
}

function normalizeDataSource(value) {
  const dataSource = String(value || '').trim()
  if (['auto', 'app-server', 'legacy'].includes(dataSource)) return dataSource
  throw new Error(`Invalid data source "${value}". Expected auto, app-server, or legacy.`)
}

function printHelp() {
  process.stdout.write(`codex-session-insights

Private reports from your local Codex sessions on this machine.
Inspired by Claude Code /insights: how you work, not a billing statement.
$insights defaults to --local-only (zero model calls). Codex has no native /insights.

Usage:
  codex-session-insights report [options]
  codex-session-insights auto [--repo <owner/name>] [--site-dir docs] [--branch main] [--no-self-update]
  codex-session-insights schedule install|status|remove [--every <hours>] [--repo <owner/name>]
  codex-session-insights profile [--source auto|account|local] [--name <name>] [--handle <handle>] [--report-json <path>] [--out-dir <path>]
  codex-session-insights [options]

Options:
  --codex-home <path>       Override the Codex data directory (default: $CODEX_HOME or ~/.codex)
  --out-dir <path>          Directory for generated report files (default: ~/.codex/usage-data)
  --report-json <path>      Existing report.json for profile export (default: ~/.codex/usage-data/report.json)
  --name <name>             Public display name for profile export (default: your Codex display name)
  --handle <handle>         Optional public handle for profile export (default: your Codex username)
  --repo <owner/name>       auto/schedule: GitHub repository whose Pages site receives the profile
  --site-dir <path>         auto/schedule: folder in that repository (default: docs)
  --branch <name>           auto/schedule: branch to push (default: main)
  --every <hours>           schedule: hours between refreshes (default: 12)
  --no-self-update          auto/schedule: skip updating the CLI and $insights skill
  --source <name>           Profile data: auto (account, else local report), account, or local (default: auto)
  --json-path <path>        Exact path for report.json
  --html-path <path>        Exact path for report.html
  --days <n>                Only include threads updated in the last N days (default: 30; 0 = all local sessions)
  --since <YYYY-MM-DD>      Only include threads updated on or after this local date (replaces --days)
  --preset <name>           Scope preset: lite, standard, or deep (default: standard)
  --limit <n>               Max unseen substantive sessions to read this run (default: 200)
  --preview <n>             Number of threads to embed in the HTML report (default: 50)
  --provider <name>         Model provider: codex-cli or openai (default: codex-cli)
  --codex-bin <path>        Override the Codex CLI binary (default: $CODEX_BIN or PATH, including Homebrew / ~/.local/bin)
  --api-key <key>           OpenAI API key override for provider=openai
  --api-base <url>          Responses API base URL override for provider=openai
  --facet-model <name>      Model for per-thread facet extraction
  --facet-effort <level>    Reasoning effort for facet extraction
  --fast-section-model <name>
                            Model for lower-risk report sections
  --fast-section-effort <level>
                            Reasoning effort for lower-risk sections
  --insight-model <name>    Model for final report generation
  --insight-effort <level>  Reasoning effort for higher-risk sections
  --facet-limit <n>         Max uncached thread facets to analyze (default: 50)
  --cache-dir <path>        Cache directory for session-meta and facet caches
  --lang <code>             Report language: en or zh-CN (default: system language)
  --include-archived        Include archived threads
  --include-subagents       Include sub-agent threads spawned from parent threads
  --reanalyze               Ignore the seen-session journal and re-read eligible threads
  --local-only              Generate deterministic reports with zero model calls
  --data-source <name>      Session source: auto, app-server, or legacy (default: auto)
  --app-server-timeout <ms> Timeout for each app-server request (default: 10000)
  --estimate-only           Print estimated analysis token usage and exit
  --stdout-json             Print the JSON report to stdout instead of a terminal summary
  --open                    Force opening report.html in your browser after generation
  --no-open                 Do not auto-open report.html after generation
  --yes                     Run immediately without interactive confirmation
  --non-interactive         Disable TTY wizard mode
  -V, --version             Print the installed version
  -h, --help                Show this help
`)
}

function renderEstimateSummary(estimate, lang = 'en') {
  const ui = getUiText(lang)
  const lines = []
  lines.push(ui.analysisEstimateTitle)
  lines.push(
    `${formatMillionTokens(estimate.estimatedRange.low)} ${ui.toWord} ${formatMillionTokens(estimate.estimatedRange.high)} ${ui.likelyWord}`,
  )
  lines.push(
    `${ui.plannedCallsLabel}=${formatInteger(estimate.estimatedCalls)} | ${ui.substantiveThreadsLabel}=${formatInteger(estimate.candidateThreads)} | ${ui.uncachedFacetsLabel}=${formatInteger(estimate.uncachedFacetThreads)} | ${ui.longTranscriptsLabel}=${formatInteger(estimate.longTranscriptThreads)}`,
  )
  lines.push(
    `${ui.inputEstimateLabel}≈${formatMillionTokens(estimate.estimatedInputTokens)} | ${ui.outputEstimateLabel}≈${formatMillionTokens(estimate.estimatedOutputTokens)}`,
  )
  return lines.join('\n')
}

function formatInteger(value) {
  return new Intl.NumberFormat('en-US').format(Math.round(Number(value || 0)))
}

function formatMillionTokens(value) {
  const millions = Number(value || 0) / 1_000_000
  if (millions >= 1) return `${millions.toFixed(2)}M tokens`
  return `${(Number(value || 0) / 1_000).toFixed(1)}K tokens`
}

function resolveShouldOpenReport(options) {
  if (options.stdoutJson || options.estimateOnly) return false
  if (typeof options.openReport === 'boolean') return options.openReport
  if (!process.stdout.isTTY) return false
  if (process.env.CI) return false
  return true
}

function shouldUseInteractiveMode(options) {
  if (
    options.yes ||
    options.nonInteractive ||
    options.estimateOnly ||
    options.localOnly ||
    options.stdoutJson
  ) {
    return false
  }
  if (process.env.CI) return false
  return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

async function openReportInBrowser(filePath) {
  const command = getOpenCommand(filePath)
  if (!command) return false

  return new Promise(resolve => {
    let settled = false
    const child = spawn(command.bin, command.args, {
      detached: true,
      stdio: 'ignore',
    })
    child.once('error', () => {
      if (settled) return
      settled = true
      resolve(false)
    })
    child.once('spawn', () => {
      if (settled) return
      settled = true
      child.unref()
      resolve(true)
    })
  })
}

function getOpenCommand(filePath) {
  if (process.platform === 'darwin') {
    return { bin: 'open', args: [filePath] }
  }
  if (process.platform === 'win32') {
    return { bin: 'explorer', args: [filePath] }
  }
  if (process.platform === 'linux') {
    return { bin: 'xdg-open', args: [filePath] }
  }
  return null
}

function formatOpenHint(filePath) {
  if (process.platform === 'darwin') return `open ${shellQuote(filePath)}`
  if (process.platform === 'win32') return `start "" ${shellQuote(filePath)}`
  if (process.platform === 'linux') return `xdg-open ${shellQuote(filePath)}`
  return filePath
}

function shellQuote(value) {
  const text = String(value)
  if (/^[A-Za-z0-9_./:-]+$/.test(text)) return text
  return `'${text.replace(/'/g, `'\\''`)}'`
}

async function runInteractiveWizard({
  options,
  codexHome,
  defaultOutDir,
  progress,
  collectThreads,
  estimateAnalysis,
}) {
  let current = {
    ...options,
    outDir: options.outDir ? path.resolve(options.outDir) : defaultOutDir,
    lang: normalizeLang(options.lang),
  }
  let ui = getUiText(current.lang)

  if (!hasCustomModelOverrides(current)) {
    Object.assign(current, applyQualityPreset(current, DEFAULT_QUALITY_PRESET))
  }

  while (true) {
    ui = getUiText(current.lang)
    process.stdout.write(`${ui.wizardTitle}\n`)
    const { collection, threadSummaries, estimate } = await collectEstimateForOptions({
      current,
      codexHome,
      ui,
      progress,
      collectThreads,
      estimateAnalysis,
    })

    process.stdout.write(`\n${renderPlanSummary(current, estimate, ui)}\n`)
    process.stdout.write(`${ui.equivalentCommandLabel}\n${buildEquivalentCommand(current)}\n\n`)

    const action = await promptChoice(
      ui.confirmQuestion,
      [
        { key: 'start', label: ui.startAnalysis },
        { key: 'adjust', label: ui.adjustSettings },
        { key: 'exit', label: ui.exitAction },
      ],
      'start',
    )

    if (action === 'start') {
      current.yes = true
      return { options: current, collection, threadSummaries, estimate }
    }
    if (action === 'exit') {
      process.stdout.write(`${ui.cancelled}\n`)
      return null
    }

    current = await runAdjustFlow(current, defaultOutDir, ui, {
      allowQualityAdjust: !hasCustomModelOverrides(options),
    })
    process.stdout.write(`\n`)
  }
}

async function collectEstimateForOptions({
  current,
  codexHome,
  ui,
  progress,
  collectThreads,
  estimateAnalysis,
}) {
  const sinceEpochSeconds = resolveSinceEpochSeconds(current)
  const cacheDir = current.cacheDir ? path.resolve(current.cacheDir) : undefined
  const usageDataDir = path.resolve(current.outDir)

  progress.startStage(current, ui.loadingIndex)
  const collection = await collectThreads(
    buildCollectOptions(current, {
      codexHome,
      sinceEpochSeconds,
      cacheDir,
      usageDataDir,
    }),
  )
  const threadSummaries = collection.summaries
  progress.completeStage(current, ui.loadingIndex)

  progress.startStage(current, ui.estimating)
  const estimate = await estimateAnalysis({
    threadSummaries,
    options: current,
  })
  progress.completeStage(current, ui.estimating)

  return { collection, threadSummaries, estimate }
}

function withRedactionHome(options, codexHome) {
  const homeDir = path.basename(codexHome) === '.codex' ? path.dirname(codexHome) : codexHome
  return { ...options, homeDir }
}

function resolveSinceEpochSeconds(options) {
  if (options.since) return Math.floor(parseSinceDate(options.since).getTime() / 1000)
  return options.days && options.days > 0
    ? Math.floor(Date.now() / 1000 - options.days * 24 * 60 * 60)
    : null
}

function parseSinceDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
  if (!date || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) {
    throw new Error(`Invalid --since value "${value}". Expected a calendar date like 2026-09-01.`)
  }
  if (date.getTime() > Date.now()) throw new Error(`--since ${value} is in the future.`)
  return date
}

function buildCollectOptions(options, extras) {
  return {
    codexHome: extras.codexHome,
    sinceEpochSeconds: extras.sinceEpochSeconds,
    limit: options.limit,
    includeArchived: options.includeArchived,
    includeSubagents: options.includeSubagents,
    cacheDir: extras.cacheDir,
    homeDir: options.homeDir,
    dataSource: options.dataSource,
    appServerTimeoutMs: options.appServerTimeoutMs,
    codexBin: options.codexBin,
    usageDataDir: extras.usageDataDir,
    reanalyze: options.reanalyze,
  }
}

async function runAdjustFlow(current, defaultOutDir, ui, config = {}) {
  current.days = await promptScopeDays(current.days, ui)
  Object.assign(current, await promptDepthPreset(current, ui))
  current.lang = await promptLanguage(current.lang, ui)
  ui = getUiText(current.lang)
  current.outDir = await promptOutputDir(current.outDir, defaultOutDir, ui)
  current.openReport = await promptYesNo(
    ui.openBrowserQuestion,
    resolveShouldOpenReport(current),
  )

  if (config.allowQualityAdjust) {
    Object.assign(current, await promptQualityPreset(current, ui))
  }

  return current
}

async function promptScopeDays(currentDays, ui) {
  const preset = inferScopePreset(currentDays)
  const scope = await promptChoice(
    ui.scopeQuestion,
    [
      { key: '7', label: ui.scope7 },
      { key: '30', label: ui.scope30 },
      { key: '90', label: ui.scope90 },
      { key: 'custom', label: ui.scopeCustom },
    ],
    preset,
  )
  if (scope === 'custom') {
    return promptIntegerInput(ui.customDaysQuestion, currentDays || 30)
  }
  return Number(scope)
}

async function promptDepthPreset(current, ui) {
  const preset = inferDepthPreset(current)
  const choice = await promptChoice(
    ui.depthQuestion,
    [
      { key: 'conservative', label: ui.depthConservative },
      { key: 'standard', label: ui.depthStandard },
      { key: 'deep', label: ui.depthDeep },
      { key: 'custom', label: ui.depthCustom },
    ],
    preset,
  )
  if (choice === 'custom') {
    const limit = await promptIntegerInput(ui.limitQuestion, current.limit)
    const facetLimit = await promptIntegerInput(ui.facetLimitQuestion, current.facetLimit)
    return { limit, facetLimit, preset: 'custom' }
  }
  return { ...applyScopePreset(current, choice), preset: choice }
}

async function promptLanguage(currentLang, ui) {
  return promptChoice(
    ui.languageQuestion,
    [
      { key: 'en', label: 'English' },
      { key: 'zh-CN', label: '简体中文' },
    ],
    normalizeLang(currentLang),
  )
}

async function promptOutputDir(currentOutDir, defaultOutDir, ui) {
  const answer = await input({
    message: ui.outputDirQuestion,
    default: currentOutDir || defaultOutDir,
  })
  return answer?.trim() ? path.resolve(answer.trim()) : currentOutDir || defaultOutDir
}

async function promptQualityPreset(current, ui) {
  const preset = inferQualityPreset(current)
  const choice = await promptChoice(
    ui.qualityQuestion,
    [
      { key: 'cheaper', label: ui.qualityCheaper },
      { key: 'balanced', label: ui.qualityBalanced },
      { key: 'higher', label: ui.qualityHigher },
    ],
    preset,
  )
  return { ...applyQualityPreset(current, choice), qualityPreset: choice }
}

async function promptChoice(question, choices, defaultKey) {
  return select({
    message: question,
    default: defaultKey,
    choices: choices.map(choice => ({
      value: choice.key,
      name: choice.label,
    })),
  })
}

async function promptYesNo(question, defaultValue) {
  return confirm({
    message: question,
    default: defaultValue,
  })
}

async function promptIntegerInput(question, defaultValue) {
  const answer = await input({
    message: question,
    default: String(defaultValue),
    validate(value) {
      const number = Number.parseInt(String(value).trim(), 10)
      if (Number.isFinite(number) && number >= 0) return true
      return 'Please enter a non-negative integer.'
    },
  })
  return Number.parseInt(String(answer).trim(), 10)
}

function inferScopePreset(days) {
  if (days === 7) return '7'
  if (days === 90) return '90'
  if (days === 30) return '30'
  return 'custom'
}

function inferDepthPreset(options) {
  if (options.limit === 20 && options.facetLimit === 8) return 'conservative'
  if (options.limit === 200 && options.facetLimit === 50) return 'standard'
  if (options.limit === 400 && options.facetLimit === 50) return 'deep'
  return 'custom'
}

function inferQualityPreset(options) {
  if (
    options.facetModel === 'gpt-5.4-mini' &&
    options.fastSectionModel === 'gpt-5.4-mini' &&
    options.insightModel === 'gpt-5.4-mini'
  ) {
    return 'cheaper'
  }
  if (
    options.facetModel === 'gpt-5.4' &&
    options.fastSectionModel === 'gpt-5.4' &&
    options.insightModel === 'gpt-5.4'
  ) {
    return 'higher'
  }
  return 'balanced'
}

function applyScopePreset(options, preset) {
  if (preset === 'lite' || preset === 'conservative') {
    return { ...options, days: 7, limit: 20, facetLimit: 8, preview: 10 }
  }
  if (preset === 'deep') return { ...options, limit: 400, facetLimit: 50 }
  return { ...options, limit: 200, facetLimit: 50 }
}

function normalizeScopePreset(value) {
  const preset = String(value || '').trim().toLowerCase()
  if (preset === 'lite') return 'lite'
  if (preset === 'conservative') return 'conservative'
  if (preset === 'deep') return 'deep'
  if (preset === 'standard' || !preset) return 'standard'
  throw new Error(`Invalid preset "${value}". Expected lite, standard, or deep.`)
}

function applyQualityPreset(options, preset) {
  if (preset === 'cheaper') {
    return {
      ...options,
      facetModel: 'gpt-5.4-mini',
      fastSectionModel: 'gpt-5.4-mini',
      insightModel: 'gpt-5.4-mini',
      facetEffort: 'low',
      fastSectionEffort: 'low',
      insightEffort: 'low',
    }
  }
  if (preset === 'higher') {
    return {
      ...options,
      facetModel: 'gpt-5.4',
      fastSectionModel: 'gpt-5.4',
      insightModel: 'gpt-5.4',
      facetEffort: 'low',
      fastSectionEffort: 'medium',
      insightEffort: 'high',
    }
  }
  return {
    ...options,
    facetModel: 'gpt-5.4-mini',
    fastSectionModel: 'gpt-5.4-mini',
    insightModel: 'gpt-5.4',
    facetEffort: 'low',
    fastSectionEffort: 'low',
    insightEffort: 'high',
  }
}

function hasCustomModelOverrides(options) {
  return Boolean(
    options.facetModel ||
      options.fastSectionModel ||
      options.insightModel ||
      options.facetEffort ||
      options.fastSectionEffort ||
      options.insightEffort,
  )
}

function renderPlanSummary(options, estimate, ui) {
  const lines = []
  lines.push(ui.planSummaryTitle)
  lines.push(
    `${options.since ? `--since ${options.since}` : `${options.days} ${ui.daysLabel}`}, ${formatDepthPresetLabel(inferDepthPreset(options), ui)}, ${options.lang === 'zh-CN' ? '简体中文' : 'English'}`,
  )
  lines.push(`${ui.outputLabel}: ${options.outDir}`)
  lines.push(`${ui.providerLabel}: ${options.provider}`)
  lines.push('')
  lines.push(renderEstimateSummary(estimate, options.lang))
  return lines.join('\n')
}

function formatDepthPresetLabel(preset, ui) {
  if (preset === 'conservative') return ui.depthConservative
  if (preset === 'deep') return ui.depthDeep
  if (preset === 'custom') return ui.depthCustom
  return ui.depthStandard
}

function buildEquivalentCommand(options) {
  const args = [
    'codex-session-insights',
    'report',
    ...(options.since ? ['--since', options.since] : ['--days', String(options.days)]),
    '--limit',
    String(options.limit),
    '--facet-limit',
    String(options.facetLimit),
    '--lang',
    normalizeLang(options.lang),
    '--yes',
  ]
  if (typeof options.openReport === 'boolean') {
    args.push(options.openReport ? '--open' : '--no-open')
  }
  if (options.includeArchived) args.push('--include-archived')
  if (options.includeSubagents) args.push('--include-subagents')
  if (options.reanalyze) args.push('--reanalyze')
  if (options.localOnly) args.push('--local-only')
  if (options.dataSource && options.dataSource !== 'auto') {
    args.push('--data-source', options.dataSource)
  }
  if (options.appServerTimeoutMs && options.appServerTimeoutMs !== 10_000) {
    args.push('--app-server-timeout', String(options.appServerTimeoutMs))
  }
  if (options.outDir) args.push('--out-dir', shellQuote(options.outDir))
  if (options.provider !== 'codex-cli') args.push('--provider', options.provider)
  if (options.facetModel) args.push('--facet-model', options.facetModel)
  if (options.fastSectionModel) args.push('--fast-section-model', options.fastSectionModel)
  if (options.insightModel) args.push('--insight-model', options.insightModel)
  if (options.facetEffort) args.push('--facet-effort', options.facetEffort)
  if (options.fastSectionEffort) args.push('--fast-section-effort', options.fastSectionEffort)
  if (options.insightEffort) args.push('--insight-effort', options.insightEffort)
  return args.join(' ')
}

function normalizeLang(value) {
  if (!value) return 'en'
  const normalized = String(value).trim()
  if (
    normalized === 'zh' ||
    normalized === 'zh-CN' ||
    normalized === 'zh-Hans' ||
    normalized.startsWith('zh_') ||
    normalized.startsWith('zh-')
  ) {
    return 'zh-CN'
  }
  return 'en'
}

function detectSystemLanguage() {
  if (process.env.CODEX_REPORT_LANG) {
    return normalizeLang(process.env.CODEX_REPORT_LANG)
  }

  const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale
  const normalizedIntl = normalizeLang(intlLocale)
  if (normalizedIntl === 'zh-CN') return normalizedIntl

  const candidates = [process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG].filter(Boolean)

  for (const value of candidates) {
    const normalized = normalizeLang(String(value).split('.')[0])
    if (normalized === 'zh-CN') return normalized
  }

  return 'en'
}

function getUiText(lang) {
  if (normalizeLang(lang) === 'zh-CN') {
    return {
      wizardTitle: '\nCodex Session Insights 配置向导\n',
      loadingIndex: '正在读取线程索引...',
      estimating: '正在预估分析成本...',
      generating: '正在生成报告...',
      writingFiles: '正在写入报告文件...',
      openingBrowser: '正在打开浏览器...',
      openedInBrowser: '已在浏览器中打开报告。',
      openHint: '可用以下命令打开',
      scopeQuestion: '选择分析时间范围：',
      scope7: '最近 7 天',
      scope30: '最近 30 天',
      scope90: '最近 90 天',
      scopeCustom: '自定义天数',
      customDaysQuestion: '输入要分析的天数',
      depthQuestion: '选择分析深度：',
      depthConservative: '保守（20 个有效线程 / 8 个 facets）',
      depthStandard: '标准（200 个有效线程 / 50 个 facets）',
      depthDeep: '深度（400 个有效线程 / 50 个 facets）',
      depthCustom: '自定义',
      limitQuestion: '输入目标有效线程数',
      facetLimitQuestion: '输入最大新增 facet 数',
      languageQuestion: '选择报告语言：',
      outputDirQuestion: '输出目录',
      openBrowserQuestion: '生成后自动打开浏览器？',
      qualityQuestion: '选择分析质量预设：',
      qualityCheaper: '更省（尽量用 gpt-5.4-mini）',
      qualityBalanced: '平衡',
      qualityHigher: '更高质量（更多使用 gpt-5.4）',
      yesDefault: '[Y/n]',
      noDefault: '[y/N]',
      invalidYesNo: '输入无效，使用默认值。',
      confirmQuestion: '确认这次分析计划：',
      startAnalysis: '开始分析',
      adjustSettings: '重新调整设置',
      exitAction: '退出',
      cancelled: '已取消。',
      equivalentCommandLabel: '等价命令：',
      planSummaryTitle: '计划摘要',
      analysisEstimateTitle: '分析预估',
      toWord: '到',
      likelyWord: '左右',
      plannedCallsLabel: '预计调用数',
      substantiveThreadsLabel: '纳入报告线程',
      uncachedFacetsLabel: '未缓存 facets',
      longTranscriptsLabel: '长 transcript',
      inputEstimateLabel: '输入',
      outputEstimateLabel: '输出',
      daysLabel: '天',
      depthLabel: '深度',
      outputLabel: '输出目录',
      providerLabel: 'Provider',
      facetProgress: '提取 facets',
      sectionProgress: '生成 sections',
      modelFallback: '模型降级',
    }
  }

  return {
    wizardTitle: '\nCodex Session Insights Setup\n',
    loadingIndex: 'Loading thread index...',
    estimating: 'Estimating analysis cost...',
    generating: 'Generating report...',
    writingFiles: 'Writing report files...',
    openingBrowser: 'Opening browser...',
    openedInBrowser: 'Opened report in your browser.',
    openHint: 'Open it with',
    scopeQuestion: 'Choose analysis range:',
    scope7: 'Last 7 days',
    scope30: 'Last 30 days',
    scope90: 'Last 90 days',
    scopeCustom: 'Custom days',
    customDaysQuestion: 'Enter number of days to analyze',
    depthQuestion: 'Choose analysis depth:',
    depthConservative: 'Conservative (20 substantive threads / 8 facets)',
    depthStandard: 'Standard (200 substantive threads / 50 facets)',
    depthDeep: 'Deep (400 substantive threads / 50 facets)',
    depthCustom: 'Custom',
    limitQuestion: 'Enter target substantive thread count',
    facetLimitQuestion: 'Enter max new facet extraction count',
    languageQuestion: 'Choose report language:',
    outputDirQuestion: 'Output directory',
    openBrowserQuestion: 'Open the report in your browser after generation?',
    qualityQuestion: 'Choose quality preset:',
    qualityCheaper: 'Cheaper (more gpt-5.4-mini)',
    qualityBalanced: 'Balanced',
    qualityHigher: 'Higher quality (more gpt-5.4)',
    yesDefault: '[Y/n]',
    noDefault: '[y/N]',
    invalidYesNo: 'Invalid input, using default.',
    confirmQuestion: 'Confirm this analysis plan:',
    startAnalysis: 'Start analysis',
    adjustSettings: 'Adjust settings',
    exitAction: 'Exit',
    cancelled: 'Cancelled.',
    equivalentCommandLabel: 'Equivalent command:',
    planSummaryTitle: 'Plan Summary',
    analysisEstimateTitle: 'Analysis Estimate',
    toWord: 'to',
    likelyWord: 'likely',
    plannedCallsLabel: 'planned calls',
    substantiveThreadsLabel: 'threads in report',
    uncachedFacetsLabel: 'uncached facets',
    longTranscriptsLabel: 'long transcripts',
    inputEstimateLabel: 'input',
    outputEstimateLabel: 'output',
    daysLabel: 'days',
    depthLabel: 'depth',
    outputLabel: 'Output',
    providerLabel: 'Provider',
    facetProgress: 'Extracting facets',
    sectionProgress: 'Generating sections',
    modelFallback: 'Model fallback',
  }
}

function logStage(options, message) {
  if (options.stdoutJson) return
  process.stdout.write(`${message}\n`)
}

function createProgressUi(initialOptions = {}) {
  const spinner =
    process.stdout.isTTY && !initialOptions.stdoutJson && !process.env.CI
      ? ora({ isSilent: false })
      : null

  return {
    startStage(options, message) {
      if (spinner) {
        spinner.start(message)
        return
      }
      logStage(options, message)
    },
    completeStage(options, message) {
      if (spinner) {
        spinner.succeed(message)
        return
      }
      logStage(options, message)
    },
    failStage(options, message) {
      if (spinner) {
        spinner.fail(message)
        return
      }
      logStage(options, message)
    },
    updateFromEvent(options, event) {
      if (!spinner || !event) return
      const ui = getUiText(options.lang)
      if (event.kind === 'facets:planned') {
        spinner.text = `${ui.facetProgress}: 0/${event.total}`
        return
      }
      if (event.kind === 'facets:progress') {
        spinner.text = `${ui.facetProgress}: ${event.completed}/${event.total}`
        return
      }
      if (event.kind === 'sections:planned') {
        spinner.text = `${ui.sectionProgress}: 0/${event.total}`
        return
      }
      if (event.kind === 'sections:progress') {
        spinner.text = `${ui.sectionProgress}: ${event.completed}/${event.total} (${event.section})`
        return
      }
      if (event.kind === 'model:fallback') {
        spinner.text = `${ui.modelFallback}: ${event.fromModel} -> ${event.toModel}`
      }
    },
  }
}

export const __test = {
  shouldUseInteractiveMode,
  applyScopePreset,
  applyQualityPreset,
  buildEquivalentCommand,
  parseArgs,
  normalizeScopePreset,
  normalizeLang,
  detectSystemLanguage,
  withRedactionHome,
  normalizeDataSource,
}
