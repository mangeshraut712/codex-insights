import test from 'node:test'
import assert from 'node:assert/strict'
import { AppServerProtocolError } from '../lib/app-server-client.js'
import { collectThreadData, collectThreadSummaries, filterSubstantiveThreads, summarizeThread } from '../lib/codex-data.js'

function legacyCollection() {
  return {
    summaries: [{ id: 'legacy-thread' }],
    coverage: {
      dataSource: 'legacy',
      discovered: 1,
      eligible: 1,
      analyzed: 1,
      excludedSource: 0,
      failedToRead: 0,
      warnings: [],
    },
  }
}

test('summarizeThread extracts tool, patch, git, and failure signals', () => {
  const thread = {
    id: 'thread-1',
    title: 'Fix rollout parser',
    firstUserMessage: 'Please fix the rollout parser and commit the change.',
    cwd: '/repo/project',
    model: 'gpt-5.4',
    modelProvider: 'openai',
    createdAt: Date.parse('2026-04-01T10:00:00Z') / 1000,
    updatedAt: Date.parse('2026-04-01T10:03:00Z') / 1000,
    tokensUsed: 999,
  }

  const patch = [
    '*** Begin Patch',
    '*** Update File: src/parser.js',
    '-const broken = true',
    '+const broken = false',
    '+export const fixed = true',
    '*** End Patch',
  ].join('\n')

  const events = [
    {
      timestamp: '2026-04-01T10:00:00Z',
      type: 'event_msg',
      payload: { type: 'user_message', message: 'Please fix the rollout parser.' },
    },
    {
      timestamp: '2026-04-01T10:00:10Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        phase: 'commentary',
        content: [{ text: 'I am checking the parser flow.' }],
      },
    },
    {
      timestamp: '2026-04-01T10:00:20Z',
      type: 'response_item',
      payload: { type: 'function_call', name: 'apply_patch', arguments: patch },
    },
    {
      timestamp: '2026-04-01T10:00:30Z',
      type: 'response_item',
      payload: { type: 'function_call', name: 'spawn_agent', arguments: '{}' },
    },
    {
      timestamp: '2026-04-01T10:00:40Z',
      type: 'response_item',
      payload: { type: 'function_call', name: 'web.search_query', arguments: '{"q":"parser bug"}' },
    },
    {
      timestamp: '2026-04-01T10:01:00Z',
      type: 'event_msg',
      payload: {
        type: 'exec_command_end',
        parsed_cmd: [{ type: 'git_commit' }],
        command: ['git', 'commit', '-m', 'fix parser'],
        exit_code: 0,
        status: 'completed',
        duration: { secs: 1, nanos: 0 },
      },
    },
    {
      timestamp: '2026-04-01T10:02:00Z',
      type: 'event_msg',
      payload: {
        type: 'user_message',
        message: 'Push it too if tests pass.',
      },
    },
    {
      timestamp: '2026-04-01T10:03:00Z',
      type: 'event_msg',
      payload: {
        type: 'exec_command_end',
        parsed_cmd: [{ type: 'git_push' }],
        command: ['git', 'push'],
        exit_code: 1,
        status: 'failed',
        aggregated_output: 'remote rejected the push',
        duration: { secs: 2, nanos: 0 },
      },
    },
    {
      timestamp: '2026-04-01T10:03:00Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 120,
            cached_input_tokens: 30,
            output_tokens: 20,
            reasoning_output_tokens: 5,
            total_tokens: 175,
          },
        },
      },
    },
  ]

  const summary = summarizeThread(thread, events)

  assert.equal(summary.userMessages, 2)
  assert.equal(summary.assistantMessages, 1)
  assert.equal(summary.totalToolCalls, 3)
  assert.equal(summary.totalCommandFailures, 1)
  assert.equal(summary.gitCommits, 1)
  assert.equal(summary.gitPushes, 1)
  assert.equal(summary.linesAdded, 2)
  assert.equal(summary.linesRemoved, 1)
  assert.equal(summary.filesModified, 1)
  assert.equal(summary.usesTaskAgent, true)
  assert.equal(summary.usesWebSearch, true)
  assert.deepEqual(summary.toolCounts, {
    apply_patch: 1,
    spawn_agent: 1,
    'web.search_query': 1,
  })
  assert.deepEqual(summary.toolFailures, { git_push: 1 })
  assert.match(summary.transcriptForAnalysis, /\[Tool: apply_patch\]/)
  assert.match(summary.transcriptForAnalysis, /\[Command failed: git_push\]/)
  assert.doesNotMatch(summary.transcriptForAnalysis, /I am checking the parser flow/)
  assert.deepEqual(summary.tokenUsage, {
    inputTokens: 120,
    cachedInputTokens: 30,
    outputTokens: 20,
    reasoningOutputTokens: 5,
    totalTokens: 175,
  })
})

test('summarizeThread redacts sensitive text before a summary can be persisted', () => {
  const homeDir = '/Users/synthetic-analyst'
  const openaiKey = 'sk-proj-SYNTHETICOPENAIKEY1234567890'
  const githubToken = 'ghp_SYNTHETICGITHUBTOKEN1234567890'
  const bearerToken = 'SYNTHETICBEARERTOKEN1234567890'
  const password = 'synthetic-password-value'
  const privateKey = 'SYNTHETIC_PRIVATE_KEY_BODY'
  const thread = {
    id: 'secret-thread',
    title: `Deploy ${openaiKey}`,
    firstUserMessage: `Use ${githubToken} from ${homeDir}/project`,
    cwd: `${homeDir}/project`,
    model: 'gpt-5.4',
    modelProvider: 'openai',
    createdAt: Date.parse('2026-04-01T10:00:00Z') / 1000,
    updatedAt: Date.parse('2026-04-01T10:03:00Z') / 1000,
    tokensUsed: 100,
  }
  const events = [
    {
      timestamp: '2026-04-01T10:00:00Z',
      type: 'event_msg',
      payload: { type: 'user_message', message: `Authorization: Bearer ${bearerToken}` },
    },
    {
      timestamp: '2026-04-01T10:00:10Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        phase: 'final_answer',
        content: [{ text: `password=${password}` }],
      },
    },
    {
      timestamp: '2026-04-01T10:02:00Z',
      type: 'event_msg',
      payload: {
        type: 'exec_command_end',
        command: ['deploy', openaiKey],
        exit_code: 1,
        status: 'failed',
        aggregated_output: `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`,
      },
    },
  ]

  const summary = summarizeThread(thread, events, { homeDir })
  const serialized = JSON.stringify(summary)

  for (const secret of [openaiKey, githubToken, bearerToken, password, privateKey, homeDir]) {
    assert.doesNotMatch(serialized, new RegExp(secret))
  }
  assert.match(serialized, /\[REDACTED_API_KEY\]/)
  assert.match(serialized, /\[REDACTED_GITHUB_TOKEN\]/)
  assert.match(serialized, /\[REDACTED_BEARER_TOKEN\]/)
  assert.match(serialized, /\[REDACTED_PASSWORD\]/)
  assert.match(serialized, /\[REDACTED_PRIVATE_KEY\]/)
  assert.ok(summary.redactions >= 6)
})

test('filterSubstantiveThreads keeps only substantial threads and sorts by recency', () => {
  const threads = [
    { id: 'older', userMessages: 3, durationMinutes: 5, transcriptForAnalysis: 'ok', updatedAt: '2026-04-01T00:00:00.000Z' },
    { id: 'too-short', userMessages: 3, durationMinutes: 0.5, transcriptForAnalysis: 'ok', updatedAt: '2026-04-03T00:00:00.000Z' },
    { id: 'empty', userMessages: 3, durationMinutes: 5, transcriptForAnalysis: '   ', updatedAt: '2026-04-04T00:00:00.000Z' },
    { id: 'recent', userMessages: 2, durationMinutes: 1, transcriptForAnalysis: 'ok', updatedAt: '2026-04-05T00:00:00.000Z' },
  ]

  const filtered = filterSubstantiveThreads(threads)

  assert.deepEqual(
    filtered.map(thread => thread.id),
    ['recent', 'older'],
  )
})

test('collectThreadData auto falls back with a warning after an app-server protocol failure', async () => {
  let legacyCalls = 0
  const result = await collectThreadData({
    createClient: async () => ({
      async request(method) {
        if (method === 'thread/list') {
          return { data: [{ id: 'thread-main', source: 'cli', updatedAt: 1 }], nextCursor: null }
        }
        if (method === 'thread/read') throw new AppServerProtocolError('Malformed JSONL from app-server')
        throw new Error(`Unexpected request ${method}`)
      },
      close() {},
    }),
    legacyCollector: async () => {
      legacyCalls += 1
      return legacyCollection()
    },
  })

  assert.equal(legacyCalls, 1)
  assert.equal(result.coverage.dataSource, 'legacy')
  assert.match(result.coverage.warnings[0], /malformed jsonl from app-server/i)
})

test('collectThreadData with explicit legacy source does not initialize app-server', async () => {
  let legacyCalls = 0
  const result = await collectThreadData({
    dataSource: 'legacy',
    createClient: async () => {
      throw new Error('app-server should not be initialized')
    },
    legacyCollector: async () => {
      legacyCalls += 1
      return legacyCollection()
    },
  })

  assert.equal(legacyCalls, 1)
  assert.deepEqual(result.summaries, [{ id: 'legacy-thread' }])
})

test('collectThreadSummaries remains a summaries-only compatibility wrapper', async () => {
  const summaries = await collectThreadSummaries({
    dataSource: 'app-server',
    createClient: async () => ({
      async request(method) {
        if (method === 'thread/list') return { data: [], nextCursor: null }
        throw new Error(`Unexpected request ${method}`)
      },
      close() {},
    }),
  })

  assert.deepEqual(summaries, [])
})

test('summarizeThread compacts consecutive tool bursts in transcriptForAnalysis', () => {
  const thread = {
    id: 'thread-tools',
    title: 'Burst',
    firstUserMessage: 'Check the repo.',
    cwd: '/repo/project',
    model: 'gpt-5.4',
    modelProvider: 'openai',
    createdAt: Date.parse('2026-04-01T10:00:00Z') / 1000,
    updatedAt: Date.parse('2026-04-01T10:03:00Z') / 1000,
    tokensUsed: 100,
  }

  const events = [
    {
      timestamp: '2026-04-01T10:00:00Z',
      type: 'event_msg',
      payload: { type: 'user_message', message: 'Check the repo.' },
    },
    {
      timestamp: '2026-04-01T10:00:05Z',
      type: 'response_item',
      payload: { type: 'function_call', name: 'exec_command', arguments: '{}' },
    },
    {
      timestamp: '2026-04-01T10:00:06Z',
      type: 'response_item',
      payload: { type: 'function_call', name: 'apply_patch', arguments: '{}' },
    },
    {
      timestamp: '2026-04-01T10:00:07Z',
      type: 'response_item',
      payload: { type: 'function_call', name: 'web.search_query', arguments: '{}' },
    },
  ]

  const summary = summarizeThread(thread, events)

  assert.match(summary.transcriptForAnalysis, /\[Tool: exec_command\]/)
  assert.match(summary.transcriptForAnalysis, /\[Tool: apply_patch\]/)
  assert.match(summary.transcriptForAnalysis, /\[Tool activity truncated: 1 more tool calls\]/)
})
