import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createAppServerClient } from '../lib/app-server-client.js'

function createFakeChild(onRequest) {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = () => {
    child.emit('close', 0)
    return true
  }

  let buffer = ''
  child.stdin.on('data', chunk => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (line.trim()) onRequest(JSON.parse(line), child)
    }
  })

  return child
}

test('createAppServerClient correlates fragmented JSONL responses after initialization', async () => {
  const requests = []
  const child = createFakeChild((message, process) => {
    requests.push(message)
    if (message.method === 'initialize') {
      process.stdout.write('{"id":1,"result":')
      process.stdout.write('{"protocolVersion":"1"}}\n')
      return
    }
    if (message.method === 'thread/list') {
      process.stdout.write('{"id":3,"result":{"request":"list"}}\n')
      return
    }
    if (message.method === 'thread/read') {
      process.stdout.write('{"id":2,"result":{"request":"read"}}\n')
    }
  })

  const client = await createAppServerClient({
    codexBin: 'codex-test',
    spawnImpl: () => child,
    timeoutMs: 100,
  })
  const [read, list] = await Promise.all([
    client.request('thread/read', { threadId: 'thread-1', includeTurns: true }),
    client.request('thread/list', { archived: false }),
  ])

  assert.deepEqual(read, { request: 'read' })
  assert.deepEqual(list, { request: 'list' })
  assert.deepEqual(
    requests.map(request => request.method),
    ['initialize', 'initialized', 'thread/read', 'thread/list'],
  )
  assert.deepEqual(requests[0].params, {
    clientInfo: {
      name: 'codex-session-insights',
      title: 'Codex Session Insights',
      version: '0.2.3',
    },
    capabilities: null,
  })
  assert.equal(requests[1].id, undefined)

  client.close()
})

test('createAppServerClient rejects when initialization exceeds its timeout', async () => {
  const child = createFakeChild(() => {})

  await assert.rejects(
    createAppServerClient({
      spawnImpl: () => child,
      timeoutMs: 20,
    }),
    /timed out/i,
  )
})
