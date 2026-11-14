import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  AppServerProtocolError,
  createAppServerClient,
} from '../lib/app-server-client.js'
import { resolveCodexBin } from '../lib/resolve-bin.js'
import { PACKAGE_VERSION } from '../lib/version.js'

function createFakeChild(onRequest) {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killCount = 0
  child.kill = () => {
    child.killCount += 1
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
      version: PACKAGE_VERSION,
    },
    capabilities: null,
  })
  assert.equal(requests[1].id, undefined)

  client.close()
})

test('createAppServerClient treats a missing Codex binary as the default `codex` command', async () => {
  const spawned = []
  const child = createFakeChild((message, process) => {
    if (message.method === 'initialize') {
      process.stdout.write('{"id":1,"result":{"protocolVersion":"1"}}\n')
    }
  })

  const client = await createAppServerClient({
    codexBin: null,
    spawnImpl: (command, args) => {
      spawned.push({ command, args })
      return child
    },
    timeoutMs: 100,
  })

  assert.deepEqual(spawned, [
    { command: resolveCodexBin(null), args: ['app-server', '--listen', 'stdio://'] },
  ])
  client.close()
})

test('createAppServerClient resolves the default binary from the caller PATH before supplemental directories', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'insights-app-server-bin-'))
  const binDir = path.join(root, 'bin')
  const fakeCodex = path.join(binDir, 'codex')
  const originalPath = process.env.PATH
  const child = createFakeChild((message, process) => {
    if (message.method === 'initialize') {
      process.stdout.write('{"id":1,"result":{"protocolVersion":"1"}}\n')
    }
  })
  const spawned = []

  try {
    await fs.mkdir(binDir)
    await fs.writeFile(fakeCodex, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    process.env.PATH = binDir

    const client = await createAppServerClient({
      spawnImpl: command => {
        spawned.push(command)
        return child
      },
      timeoutMs: 100,
    })

    assert.deepEqual(spawned, [fakeCodex])
    client.close()
  } finally {
    if (originalPath === undefined) delete process.env.PATH
    else process.env.PATH = originalPath
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('createAppServerClient adds Homebrew and ~/.local/bin to the spawn PATH', async () => {
  let spawnPath = ''
  const child = createFakeChild((message, process) => {
    if (message.method === 'initialize') {
      process.stdout.write('{"id":1,"result":{"protocolVersion":"1"}}\n')
    }
  })

  const client = await createAppServerClient({
    spawnImpl: (_command, _args, options) => {
      spawnPath = options?.env?.PATH ?? ''
      return child
    },
    timeoutMs: 100,
  })

  assert.match(spawnPath, /\.local[/\\]bin/)
  assert.match(spawnPath, /homebrew/)
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

test('createAppServerClient classifies JSON-RPC incompatibility errors as protocol failures', async () => {
  const child = createFakeChild((message, process) => {
    if (message.method === 'initialize') {
      process.stdout.write('{"id":1,"result":{"protocolVersion":"1"}}\n')
      return
    }
    if (message.method === 'thread/read') {
      process.stdout.write(
        `${JSON.stringify({ id: message.id, error: { code: -32602, message: 'Invalid params' } })}\n`,
      )
    }
  })

  const client = await createAppServerClient({ spawnImpl: () => child, timeoutMs: 100 })

  await assert.rejects(
    client.request('thread/read', { threadId: 'thread-1', includeTurns: true }),
    error => error instanceof AppServerProtocolError && error.code === -32602,
  )
  client.close()
})

test('createAppServerClient kills the child exactly once after malformed JSONL', async () => {
  const child = createFakeChild((message, process) => {
    if (message.method === 'initialize') {
      process.stdout.write('{"id":1,"result":{"protocolVersion":"1"}}\n')
      return
    }
    if (message.method === 'thread/list') {
      process.stdout.write('{malformed}\n')
    }
  })

  const client = await createAppServerClient({ spawnImpl: () => child, timeoutMs: 100 })

  await assert.rejects(client.request('thread/list', { archived: false }), /malformed JSONL/i)
  client.close()
  assert.equal(child.killCount, 1)
})

test('createAppServerClient correlates numeric requests with string JSON-RPC ids', async () => {
  const child = createFakeChild((message, process) => {
    if (message.method === 'initialize') {
      process.stdout.write('{"id":"1","result":{"protocolVersion":"1"}}\n')
      return
    }
    if (message.method === 'thread/list') {
      process.stdout.write(`{"id":"${message.id}","result":{"ok":true}}\n`)
    }
  })

  const client = await createAppServerClient({ spawnImpl: () => child, timeoutMs: 100 })
  assert.deepEqual(await client.request('thread/list', { archived: false }), { ok: true })
  client.close()
})

test('createAppServerClient rejects an oversized stdout line', async () => {
  const child = createFakeChild((message, process) => {
    if (message.method === 'initialize') {
      process.stdout.write('{"id":1,"result":{"protocolVersion":"1"}}\n')
      return
    }
    if (message.method !== 'thread/list') return
    queueMicrotask(() => process.stdout.write(`${'x'.repeat(200)}\n`))
  })

  const client = await createAppServerClient({
    spawnImpl: () => child,
    timeoutMs: 100,
    maxStdoutBuffer: 64,
  })
  await assert.rejects(client.request('thread/list', { archived: false }), /buffer limit/i)
  client.close()
})


test('createAppServerClient preserves UTF-8 characters split across stdout chunks', async () => {
  const expected = { title: '修复 café 🚀' }
  const child = createFakeChild((message, process) => {
    if (message.method === 'initialize') {
      process.stdout.write(JSON.stringify({ id: message.id, result: {} }) + '\n')
    } else if (message.method === 'thread/list') {
      const bytes = Buffer.from(JSON.stringify({ id: message.id, result: expected }) + '\n')
      for (const byte of bytes) process.stdout.write(Buffer.from([byte]))
    }
  })
  const client = await createAppServerClient({ spawnImpl: () => child, timeoutMs: 100 })
  try {
    assert.deepEqual(await client.request('thread/list', {}), expected)
  } finally {
    client.close()
  }
})

test('createAppServerClient allows history pagination but rejects mutating methods', async () => {
  const child = createFakeChild((message, process) => {
    if (message.id) process.stdout.write(JSON.stringify({ id: message.id, result: { data: [] } }) + '\n')
  })
  const client = await createAppServerClient({ spawnImpl: () => child, timeoutMs: 100 })
  try {
    for (const method of ['thread/turns/list', 'thread/items/list']) {
      assert.deepEqual(await client.request(method, { threadId: 'example-thread' }), { data: [] })
    }
    await assert.rejects(client.request('thread/start', {}), /Unsupported read-only/)
  } finally {
    client.close()
  }
})

test('createAppServerClient bounds each response rather than a batch of valid lines', async () => {
  const child = createFakeChild((message, process) => {
    if (message.method === 'initialize') process.stdout.write('{"id":1,"result":{}}\n')
    if (message.method === 'thread/list') {
      const notification = JSON.stringify({ method: 'notice', params: 'x'.repeat(25) }) + '\n'
      process.stdout.write(notification.repeat(3) + JSON.stringify({ id: message.id, result: { ok: true } }) + '\n')
    }
  })
  const client = await createAppServerClient({ spawnImpl: () => child, maxStdoutBuffer: 64 })
  try {
    assert.deepEqual(await client.request('thread/list', {}), { ok: true })
  } finally {
    client.close()
  }
})

test('createAppServerClient rejects oversized unterminated responses across chunks', async () => {
  const child = createFakeChild((message, process) => {
    if (message.method === 'initialize') process.stdout.write('{"id":1,"result":{}}\n')
    if (message.method === 'thread/list') {
      process.stdout.write('x'.repeat(40))
      process.stdout.write('x'.repeat(40))
    }
  })
  const client = await createAppServerClient({ spawnImpl: () => child, maxStdoutBuffer: 64 })
  try {
    await assert.rejects(client.request('thread/list', {}), /buffer limit/)
    assert.equal(child.killCount, 1)
  } finally {
    client.close()
  }
})
