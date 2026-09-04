import { createAppServerClient, isAppServerProtocolError } from './app-server-client.js'
import { redactSessionSummary } from './redaction.js'
import { createCoverage, loadUnseenAwarePopulation } from './seen-sessions.js'

const INTERACTIVE_SOURCE_KINDS = ['cli', 'vscode', 'exec', 'appServer']
const SUBAGENT_SOURCE_KINDS = new Set([
  'subAgent',
  'subAgentReview',
  'subAgentCompact',
  'subAgentThreadSpawn',
  'subAgentOther',
])
const ALL_SOURCE_KINDS = [...INTERACTIVE_SOURCE_KINDS, ...SUBAGENT_SOURCE_KINDS, 'unknown']
const DEFAULT_PAGE_SIZE = 100

export async function collectAppServerThreadSummaries(options = {}) {
  const createClient = options.createClient ?? createAppServerClient
  const client = await createClient({
    codexBin: options.codexBin,
    timeoutMs: options.appServerTimeoutMs ?? options.timeoutMs,
    spawnImpl: options.spawnImpl,
  })
  const coverage = createCoverage('app-server')

  try {
    const threads = await listThreads(client, options)
    coverage.discovered = threads.length
    const eligibleThreads = threads.filter(thread => {
      if (shouldExcludeSource(thread, options.includeSubagents)) {
        coverage.excludedSource += 1
        return false
      }
      if (options.sinceEpochSeconds && Number(thread.updatedAt) < Number(options.sinceEpochSeconds)) {
        return false
      }
      return true
    })
    coverage.eligible = eligibleThreads.length

    return await loadUnseenAwarePopulation({
      eligibleThreads,
      coverage,
      unseenLimit: toLimit(options.limit),
      reanalyze: options.reanalyze,
      usageDataDir: options.usageDataDir,
      isFatalReadError: isAppServerProtocolError,
      readSummary: async thread => {
        const response = await client.request('thread/read', {
          threadId: thread.id,
          includeTurns: true,
        })
        return summarizeAppServerThread(response.thread ?? thread, options)
      },
    })
  } finally {
    client.close()
  }
}

async function listThreads(client, options) {
  const pageSize = Math.min(toLimit(options.limit) || DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE)
  const sourceKinds = ALL_SOURCE_KINDS
  const threads = []
  const archivedValues = options.includeArchived ? [false, true] : [false]

  for (const archived of archivedValues) {
    let cursor = null
    do {
      const params = {
        archived,
        limit: pageSize,
        sortKey: 'updated_at',
        sortDirection: 'desc',
        ...(cursor ? { cursor } : {}),
        sourceKinds,
      }
      const response = await client.request('thread/list', params)
      threads.push(...(response.data ?? []))
      cursor = response.nextCursor ?? null
    } while (cursor)
  }
  return threads
}

export function summarizeAppServerThread(thread, options = {}) {
  const toolCounts = {}
  const commandKindCounts = {}
  const toolFailures = {}
  const toolErrorCategories = {}
  const commandFailures = []
  const commandSamples = []
  const commandDurationsMs = []
  const transcriptLines = []
  const filesModified = new Set()
  const userMessageTimestamps = []
  let firstUserMessage = ''
  let userMessages = 0
  let assistantMessages = 0
  let commentaryMessages = 0
  let finalMessages = 0
  let reasoningItems = 0
  let gitCommits = 0
  let gitPushes = 0
  let toolErrors = 0
  let usesTaskAgent = false
  let usesMcp = false
  let usesWebSearch = false
  let usesWebFetch = false
  let linesAdded = 0
  let linesRemoved = 0

  const turns = Array.isArray(thread.turns) ? thread.turns : []
  for (const turn of turns) {
    const timestamp = toIso(turn.startedAt ?? turn.completedAt ?? thread.createdAt)
    for (const item of turn.items ?? []) {
      if (item.type === 'userMessage') {
        const text = extractUserText(item.content)
        userMessages += 1
        if (!firstUserMessage) firstUserMessage = text
        if (text) transcriptLines.push(`[User] ${text}`)
        if (timestamp) userMessageTimestamps.push(timestamp)
        continue
      }

      if (item.type === 'agentMessage') {
        assistantMessages += 1
        if (item.phase === 'commentary') commentaryMessages += 1
        if (item.phase === 'final' || item.phase === 'final_answer') finalMessages += 1
        if (item.text) transcriptLines.push(`[Assistant] ${String(item.text).trim()}`)
        continue
      }

      if (item.type === 'reasoning') {
        reasoningItems += 1
        continue
      }

      if (item.type === 'commandExecution') {
        const key = String(item.commandActions?.[0]?.type ?? 'commandExecution')
        commandKindCounts[key] = (commandKindCounts[key] || 0) + 1
        if (/\bgit\s+commit\b/.test(item.command ?? '')) gitCommits += 1
        if (/\bgit\s+push\b/.test(item.command ?? '')) gitPushes += 1
        if (Number.isFinite(item.durationMs) && item.durationMs > 0) commandDurationsMs.push(item.durationMs)
        if (commandSamples.length < 8) {
          commandSamples.push({
            command: String(item.command ?? ''),
            status: String(item.status ?? ''),
            exitCode: Number(item.exitCode ?? 0),
          })
        }
        if (item.status === 'failed' || Number(item.exitCode ?? 0) !== 0) {
          toolFailures[key] = (toolFailures[key] || 0) + 1
          toolErrorCategories[key] = (toolErrorCategories[key] || 0) + 1
          toolErrors += 1
          commandFailures.push({
            command: String(item.command ?? ''),
            exitCode: Number(item.exitCode ?? 1),
            output: String(item.aggregatedOutput ?? '').slice(0, 120),
          })
        }
        continue
      }

      if (item.type === 'fileChange') {
        for (const change of item.changes ?? []) {
          if (change.path) filesModified.add(change.path)
          const patch = String(change.diff ?? '')
          for (const line of patch.split('\n')) {
            if (line.startsWith('+') && !line.startsWith('+++')) linesAdded += 1
            if (line.startsWith('-') && !line.startsWith('---')) linesRemoved += 1
          }
        }
        continue
      }

      const tool = toolName(item)
      if (!tool) continue
      toolCounts[tool] = (toolCounts[tool] || 0) + 1
      transcriptLines.push(`[Tool: ${tool}]`)
      if (item.type === 'mcpToolCall') usesMcp = true
      if (item.type === 'collabAgentToolCall') usesTaskAgent = true
      if (item.type === 'webSearch') {
        if (item.action?.type === 'search' || !item.action) usesWebSearch = true
        else usesWebFetch = true
      }
      if (isFailedTool(item)) {
        toolFailures[tool] = (toolFailures[tool] || 0) + 1
        toolErrorCategories[tool] = (toolErrorCategories[tool] || 0) + 1
        toolErrors += 1
      }
    }
  }

  const startedAt = turns[0]?.startedAt ?? thread.createdAt
  const endedAt = turns.at(-1)?.completedAt ?? thread.updatedAt
  const sortedUserTimestamps = userMessageTimestamps.sort()
  const title = String(thread.name ?? thread.preview ?? '')
  const durationMinutes = Math.max(0, Math.round(((Number(endedAt) - Number(startedAt)) / 60) * 10) / 10)

  return redactSessionSummary({
    id: String(thread.id),
    title,
    firstUserMessage: firstUserMessage || String(thread.preview ?? ''),
    cwd: String(thread.cwd ?? ''),
    model: '',
    modelProvider: String(thread.modelProvider ?? ''),
    createdAt: toIso(thread.createdAt),
    updatedAt: toIso(thread.updatedAt),
    durationMinutes,
    userMessages,
    assistantMessages,
    commentaryMessages,
    finalMessages,
    reasoningItems,
    toolCounts,
    commandKindCounts,
    toolFailures,
    totalToolCalls: Object.values(toolCounts).reduce((sum, count) => sum + count, 0),
    totalCommandFailures: commandFailures.length,
    commandFailures: commandFailures.slice(0, 8),
    commandSamples,
    averageCommandDurationMs: average(commandDurationsMs),
    medianResponseTimeSeconds: 0,
    averageResponseTimeSeconds: 0,
    activeHours: sortedUserTimestamps.map(timestamp => new Date(timestamp).getHours()),
    userMessageTimestamps: sortedUserTimestamps,
    transcriptForAnalysis: transcriptLines.join('\n').slice(0, 30_000),
    gitCommits,
    gitPushes,
    userInterruptions: 0,
    toolErrors,
    toolErrorCategories,
    usesTaskAgent,
    usesMcp,
    usesWebSearch,
    usesWebFetch,
    linesAdded,
    linesRemoved,
    filesModified: filesModified.size,
    tokenUsage: {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    },
  }, options)
}

function shouldExcludeSource(thread, includeSubagents) {
  if (includeSubagents) return false
  const source = sourceKind(thread.source)
  return Boolean(thread.parentThreadId) || SUBAGENT_SOURCE_KINDS.has(source)
}

function sourceKind(source) {
  if (typeof source === 'string') return source
  if (source && typeof source === 'object') return Object.keys(source)[0] ?? 'unknown'
  return 'unknown'
}

function extractUserText(content) {
  return (content ?? [])
    .filter(part => part?.type === 'text' && typeof part.text === 'string')
    .map(part => part.text.trim())
    .filter(Boolean)
    .join('\n')
}

function toolName(item) {
  if (item.type === 'mcpToolCall') return `mcp__${item.server}__${item.tool}`
  if (item.type === 'dynamicToolCall') return `${item.namespace ?? 'dynamic'}__${item.tool}`
  if (item.type === 'collabAgentToolCall') return String(item.tool)
  if (item.type === 'webSearch') return 'web.search_query'
  return ''
}

function isFailedTool(item) {
  return item.status === 'failed' || item.success === false
}

function toLimit(value) {
  const limit = Number(value ?? 0)
  return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0
}

function toIso(epochSeconds) {
  const timestamp = Number(epochSeconds)
  return Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : new Date(0).toISOString()
}

function average(values) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
