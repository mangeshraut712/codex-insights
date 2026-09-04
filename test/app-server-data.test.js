import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AppServerProtocolError } from '../lib/app-server-client.js'
import { collectAppServerThreadSummaries } from '../lib/app-server-data.js'
import { collectThreadData } from '../lib/codex-data.js'
import { persistAnalyzedSessions } from '../lib/seen-sessions.js'

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
          {
            type: 'userMessage',
            id: 'user-follow-up',
            content: [{ type: 'text', text: 'Run the focused tests too' }],
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

test('collectAppServerThreadSummaries paginates all source kinds and excludes subagents locally', async () => {
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
                items: [
                  { type: 'userMessage', id: 'user-2', content: [{ type: 'text', text: 'Second task' }] },
                  { type: 'userMessage', id: 'user-3', content: [{ type: 'text', text: 'Verify it' }] },
                ],
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
        sourceKinds: [
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
        ],
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
        sourceKinds: [
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
        ],
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
  assert.equal(summary.userMessages, 2)
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
  assert.equal(coverage.unseen, 2)
  assert.equal(coverage.unseenAnalyzed, 2)
  assert.equal(coverage.reused, 0)
  assert.equal(coverage.excludedUnseenOverCap, 0)
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

test('collectAppServerThreadSummaries includes all source kinds when subagents are enabled', async () => {
  const calls = []
  const client = {
    async request(method, params) {
      calls.push({ method, params })
      if (method === 'thread/list') {
        return {
          data: [makeThread({ id: 'subagent', source: { subAgent: 'child' }, parentThreadId: 'thread-main' })],
          nextCursor: null,
        }
      }
      if (method === 'thread/read') {
        return {
          thread: makeThread({
            id: params.threadId,
            turns: [
              {
                startedAt: 1_710_000_000,
                completedAt: 1_710_000_120,
                items: [
                  { type: 'userMessage', id: 'sub-user-1', content: [{ type: 'text', text: 'Review it' }] },
                  { type: 'userMessage', id: 'sub-user-2', content: [{ type: 'text', text: 'Report back' }] },
                ],
              },
            ],
          }),
        }
      }
      throw new Error(`Unexpected request ${method}`)
    },
    close() {},
  }

  const result = await collectAppServerThreadSummaries({ includeSubagents: true, createClient: async () => client })

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
  assert.deepEqual(result.summaries.map(summary => summary.id), ['subagent'])
  assert.equal(result.coverage.excludedSource, 0)
})

test('collectAppServerThreadSummaries counts an isolated unreadable thread', async () => {
  const client = {
    async request(method, params) {
      if (method === 'thread/list') return { data: [makeThread()], nextCursor: null }
      if (method === 'thread/read' && params.threadId === 'thread-main') throw new Error('Thread is unreadable')
      throw new Error(`Unexpected request ${method}`)
    },
    close() {},
  }

  const result = await collectAppServerThreadSummaries({ createClient: async () => client })

  assert.deepEqual(result.summaries, [])
  assert.equal(result.coverage.failedToRead, 1)
  assert.equal(result.coverage.analyzed, 0)
})

test('collectAppServerThreadSummaries applies limit after substantive filtering', async () => {
  const shortThread = makeThread({
    id: 'short-thread',
    turns: [
      {
        startedAt: 1_710_000_000,
        completedAt: 1_710_000_010,
        items: [{ type: 'userMessage', id: 'short-user', content: [{ type: 'text', text: 'Hi' }] }],
      },
    ],
  })
  const substantiveThread = makeThread({
    id: 'substantive-thread',
    turns: [
      {
        startedAt: 1_710_000_000,
        completedAt: 1_710_000_120,
        items: [
          { type: 'userMessage', id: 'user-1', content: [{ type: 'text', text: 'Fix the adapter' }] },
          { type: 'agentMessage', id: 'agent-1', text: 'Working on it.', phase: 'commentary' },
          { type: 'userMessage', id: 'user-2', content: [{ type: 'text', text: 'Run the tests too' }] },
          { type: 'agentMessage', id: 'agent-2', text: 'Tests pass.', phase: 'final' },
        ],
      },
    ],
  })
  const reads = []
  const client = {
    async request(method, params) {
      if (method === 'thread/list') {
        return { data: [shortThread, substantiveThread], nextCursor: null }
      }
      if (method === 'thread/read') {
        reads.push(params.threadId)
        return { thread: params.threadId === shortThread.id ? shortThread : substantiveThread }
      }
      throw new Error(`Unexpected request ${method}`)
    },
    close() {},
  }

  const result = await collectAppServerThreadSummaries({
    limit: 1,
    createClient: async () => client,
  })

  assert.deepEqual(reads, ['short-thread', 'substantive-thread'])
  assert.deepEqual(result.summaries.map(summary => summary.id), ['substantive-thread'])
  assert.equal(result.coverage.analyzed, 1)
  assert.equal(result.coverage.sampled, 2)
  assert.equal(result.coverage.excludedShort, 1)
  assert.equal(result.coverage.unseen, 2)
  assert.equal(result.coverage.unseenAnalyzed, 1)
  assert.equal(result.coverage.excludedUnseenOverCap, 0)
  assert.deepEqual(result.seenEntries, [{ id: 'short-thread', updatedAt: shortThread.updatedAt }])
})

test('collectAppServerThreadSummaries applies a custom home redaction root', async () => {
  const homeDir = '/Volumes/synthetic-codex-home'
  const thread = makeThread({
    id: 'custom-home-thread',
    cwd: `${homeDir}/private/project`,
    preview: `Inspect ${homeDir}/private/project`,
    turns: [
      {
        startedAt: 1_710_000_000,
        completedAt: 1_710_000_120,
        items: [
          { type: 'userMessage', id: 'custom-user-1', content: [{ type: 'text', text: `Read ${homeDir}/one` }] },
          { type: 'userMessage', id: 'custom-user-2', content: [{ type: 'text', text: `Check ${homeDir}/two` }] },
        ],
      },
    ],
  })
  const client = {
    async request(method) {
      if (method === 'thread/list') return { data: [thread], nextCursor: null }
      if (method === 'thread/read') return { thread }
      throw new Error(`Unexpected request ${method}`)
    },
    close() {},
  }

  const result = await collectAppServerThreadSummaries({
    homeDir,
    createClient: async () => client,
  })
  const serialized = JSON.stringify(result.summaries)

  assert.doesNotMatch(serialized, new RegExp(homeDir))
  assert.match(serialized, /\[REDACTED_HOME\]/)
})

test('collectAppServerThreadSummaries propagates a protocol failure from thread/read', async () => {
  const client = {
    async request(method, params) {
      if (method === 'thread/list') return { data: [makeThread()], nextCursor: null }
      if (method === 'thread/read' && params.threadId === 'thread-main') {
        throw new AppServerProtocolError('Connection to Codex app-server was lost')
      }
      throw new Error(`Unexpected request ${method}`)
    },
    close() {},
  }

  await assert.rejects(
    collectAppServerThreadSummaries({ createClient: async () => client }),
    /connection to codex app-server was lost/i,
  )
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

function substantiveThread(id) {
  const thread = mainThreadWithItems()
  thread.id = id
  thread.updatedAt = 1_710_000_180 + id.length
  return thread
}

test('collectAppServerThreadSummaries caps unseen substantive reads at --limit', async () => {
  const first = substantiveThread('thread-a')
  const second = substantiveThread('thread-b')
  const reads = []
  const client = {
    async request(method, params) {
      if (method === 'thread/list') return { data: [first, second], nextCursor: null }
      if (method === 'thread/read') {
        reads.push(params.threadId)
        return { thread: params.threadId === first.id ? first : second }
      }
      throw new Error(`Unexpected request ${method}`)
    },
    close() {},
  }

  const result = await collectAppServerThreadSummaries({
    limit: 1,
    createClient: async () => client,
  })

  assert.deepEqual(reads, ['thread-a'])
  assert.deepEqual(result.summaries.map(summary => summary.id), ['thread-a'])
  assert.equal(result.coverage.unseen, 2)
  assert.equal(result.coverage.unseenAnalyzed, 1)
  assert.equal(result.coverage.excludedUnseenOverCap, 1)
  assert.equal(result.coverage.analyzed, 1)
})

test('collectAppServerThreadSummaries reuses archived sessions and reanalyze rereads them', async () => {
  const usageDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-insights-seen-'))
  const first = substantiveThread('thread-a')
  const second = substantiveThread('thread-b')
  const reads = []
  const client = {
    async request(method, params) {
      if (method === 'thread/list') return { data: [first, second], nextCursor: null }
      if (method === 'thread/read') {
        reads.push(params.threadId)
        return { thread: params.threadId === first.id ? first : second }
      }
      throw new Error(`Unexpected request ${method}`)
    },
    close() {},
  }

  const initial = await collectAppServerThreadSummaries({
    usageDataDir,
    createClient: async () => client,
  })
  assert.deepEqual(reads, ['thread-a', 'thread-b'])
  assert.equal(initial.coverage.reused, 0)
  await persistAnalyzedSessions(usageDataDir, initial.summaries, { alsoSeen: initial.seenEntries })

  reads.length = 0
  const reused = await collectAppServerThreadSummaries({
    usageDataDir,
    createClient: async () => client,
  })
  assert.deepEqual(reads, [])
  assert.equal(reused.coverage.reused, 2)
  assert.equal(reused.coverage.unseen, 0)
  assert.equal(reused.coverage.unseenAnalyzed, 0)
  assert.deepEqual(reused.summaries.map(summary => summary.id).sort(), ['thread-a', 'thread-b'])

  second.updatedAt += 60
  reads.length = 0
  const changed = await collectAppServerThreadSummaries({
    usageDataDir,
    createClient: async () => client,
  })
  assert.deepEqual(reads, ['thread-b'])
  assert.equal(changed.coverage.reused, 1)
  assert.equal(changed.coverage.unseenAnalyzed, 1)

  reads.length = 0
  const again = await collectAppServerThreadSummaries({
    usageDataDir,
    reanalyze: true,
    createClient: async () => client,
  })
  assert.deepEqual(reads, ['thread-a', 'thread-b'])
  assert.equal(again.coverage.reused, 0)
  assert.equal(again.coverage.unseenAnalyzed, 2)
})
