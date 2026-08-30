import test from 'node:test'
import assert from 'node:assert/strict'
import { collectAppServerThreadSummaries } from '../lib/app-server-data.js'
import { collectThreadData } from '../lib/codex-data.js'

function makeThread(overrides = {}) {
  return {
    id: 'thread-main',
    preview: 'Fix the adapter',
    name: 'Adapter repair',
    cwd: '/repo/adapter',
    modelProvider: 'openai',
    createdAt: 1_710_000_000,
    updatedAt: 1_710_000_180,
    source: 'cli',
    parentThreadId: null,
    turns: [],
    ...overrides,
  }
}

function mainThreadWithItems() {
  return makeThread({
    turns: [
      {
        startedAt: 1_710_000_000,
        completedAt: 1_710_000_180,
        items: [
          {
            type: 'userMessage',
            id: 'user-1',
            content: [{ type: 'text', text: 'Fix the adapter' }],
          },
          { type: 'agentMessage', id: 'agent-1', text: 'Adapter fixed.', phase: 'final' },
          {
            type: 'commandExecution',
            id: 'command-1',
            command: 'git commit -m fix',
            status: 'completed',
            exitCode: 0,
            durationMs: 25,
          },
          {
            type: 'commandExecution',
            id: 'command-2',
            command: 'npm test',
            status: 'failed',
            exitCode: 1,
            aggregatedOutput: 'one test failed',
            durationMs: 50,
          },
          {
            type: 'fileChange',
            id: 'file-1',
            status: 'completed',
            changes: [{ path: 'lib/adapter.js', kind: { type: 'update' }, diff: '-old\n+new\n+extra' }],
          },
          { type: 'mcpToolCall', id: 'mcp-1', server: 'files', tool: 'read', status: 'completed' },
          { type: 'dynamicToolCall', id: 'tool-1', namespace: 'functions', tool: 'exec', status: 'completed' },
          { type: 'collabAgentToolCall', id: 'agent-tool-1', tool: 'spawnAgent', status: 'completed' },
          { type: 'webSearch', id: 'web-1', query: 'Codex app server', action: { type: 'search' } },
        ],
      },
    ],
  })
}

test('collectAppServerThreadSummaries paginates interactive threads and maps documented turn items', async () => {
  const calls = []
  const client = {
    async request(method, params) {
      calls.push({ method, params })
      if (method === 'thread/list' && !params.cursor) {
        return {
          data: [
            makeThread(),
            makeThread({ id: 'subagent', source: { subAgent: 'child' }, parentThreadId: 'thread-main' }),
          ],
          nextCursor: 'page-2',
        }
      }
      if (method === 'thread/list') {
        return { data: [makeThread({ id: 'thread-second', preview: 'Second task' })], nextCursor: null }
      }
      if (method === 'thread/read' && params.threadId === 'thread-main') {
        return { thread: mainThreadWithItems() }
      }
      if (method === 'thread/read') {
        return {
          thread: makeThread({
            id: params.threadId,
            turns: [
              {
                startedAt: 1_710_000_000,
                completedAt: 1_710_000_060,
                items: [{ type: 'userMessage', id: 'user-2', content: [{ type: 'text', text: 'Second task' }] }],
              },
            ],
          }),
        }
      }
      throw new Error(`Unexpected request ${method}`)
    },
    close() {},
  }

  const { summaries, coverage } = await collectAppServerThreadSummaries({
    limit: 10,
    createClient: async () => client,
  })

  assert.deepEqual(summaries.map(summary => summary.id), ['thread-main', 'thread-second'])
  assert.deepEqual(calls.slice(0, 2), [
    {
      method: 'thread/list',
      params: {
        archived: false,
        limit: 10,
        sortKey: 'updated_at',
        sortDirection: 'desc',
        sourceKinds: ['cli', 'vscode', 'exec', 'appServer'],
      },
    },
    {
      method: 'thread/list',
      params: {
        archived: false,
        cursor: 'page-2',
        limit: 10,
        sortKey: 'updated_at',
        sortDirection: 'desc',
        sourceKinds: ['cli', 'vscode', 'exec', 'appServer'],
      },
    },
  ])
  assert.deepEqual(
    calls.filter(call => call.method === 'thread/read').map(call => call.params),
    [
      { threadId: 'thread-main', includeTurns: true },
      { threadId: 'thread-second', includeTurns: true },
    ],
  )

  const summary = summaries[0]
  assert.equal(summary.title, 'Adapter repair')
  assert.equal(summary.firstUserMessage, 'Fix the adapter')
  assert.equal(summary.userMessages, 1)
  assert.equal(summary.assistantMessages, 1)
  assert.equal(summary.totalToolCalls, 4)
  assert.equal(summary.totalCommandFailures, 1)
  assert.equal(summary.gitCommits, 1)
  assert.equal(summary.filesModified, 1)
  assert.equal(summary.linesAdded, 2)
  assert.equal(summary.linesRemoved, 1)
  assert.equal(summary.usesMcp, true)
  assert.equal(summary.usesTaskAgent, true)
  assert.equal(summary.usesWebSearch, true)
  assert.deepEqual(summary.toolCounts, {
    'mcp__files__read': 1,
    'functions__exec': 1,
    spawnAgent: 1,
    'web.search_query': 1,
  })
  assert.match(summary.transcriptForAnalysis, /\[User\] Fix the adapter/)
  assert.match(summary.transcriptForAnalysis, /\[Assistant\] Adapter fixed\./)
  assert.match(summary.transcriptForAnalysis, /\[Tool: mcp__files__read\]/)
  assert.equal(coverage.dataSource, 'app-server')
  assert.equal(coverage.discovered, 3)
  assert.equal(coverage.excludedSource, 1)
  assert.equal(coverage.eligible, 2)
  assert.equal(coverage.analyzed, 2)
  assert.equal(coverage.failedToRead, 0)
})

test('collectAppServerThreadSummaries lists archived threads only when requested', async () => {
  const calls = []
  const client = {
    async request(method, params) {
      calls.push({ method, params })
      if (method === 'thread/list') return { data: [], nextCursor: null }
      throw new Error(`Unexpected request ${method}`)
    },
    close() {},
  }

  await collectAppServerThreadSummaries({ includeArchived: true, createClient: async () => client })

  assert.deepEqual(
    calls.map(call => call.params.archived),
    [false, true],
  )
})

test('collectAppServerThreadSummaries requests subagent source kinds only when included', async () => {
  const calls = []
  const client = {
    async request(method, params) {
      calls.push({ method, params })
      if (method === 'thread/list') return { data: [], nextCursor: null }
      throw new Error(`Unexpected request ${method}`)
    },
    close() {},
  }

  await collectAppServerThreadSummaries({ includeSubagents: true, createClient: async () => client })

  assert.deepEqual(calls[0].params.sourceKinds, [
    'cli',
    'vscode',
    'exec',
    'appServer',
    'subAgent',
    'subAgentReview',
    'subAgentCompact',
    'subAgentThreadSpawn',
    'subAgentOther',
    'unknown',
  ])
})

test('collectThreadData selects the documented app-server source when requested', async () => {
  const client = {
    async request(method) {
      if (method === 'thread/list') return { data: [], nextCursor: null }
      throw new Error(`Unexpected request ${method}`)
    },
    close() {},
  }

  const result = await collectThreadData({
    dataSource: 'app-server',
    createClient: async () => client,
  })

  assert.deepEqual(result.summaries, [])
  assert.equal(result.coverage.dataSource, 'app-server')
})
