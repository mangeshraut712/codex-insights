import { spawn } from 'node:child_process'

const READ_ONLY_METHODS = new Set(['thread/list', 'thread/read'])
const DEFAULT_TIMEOUT_MS = 10_000

export class AppServerProtocolError extends Error {
  /**
   * @param {string} message
   * @param {{ cause?: unknown, code?: number }} [options]
   */
  constructor(message, { cause, code } = {}) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'AppServerProtocolError'
    this.code = code
  }
}

export function isAppServerProtocolError(error) {
  return error instanceof AppServerProtocolError
}

export async function createAppServerClient({
  codexBin = 'codex',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnImpl = spawn,
} = {}) {
  const child = spawnImpl(codexBin, ['app-server', '--listen', 'stdio://'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const pending = new Map()
  let nextId = 1
  let closed = false
  let childStopped = false
  let stdoutBuffer = ''

  const stopChild = () => {
    if (childStopped) return
    childStopped = true
    child.kill()
  }

  const rejectPending = error => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer)
      reject(error)
    }
    pending.clear()
  }

  const fail = error => {
    if (closed) return
    closed = true
    rejectPending(toProtocolError(error))
    stopChild()
  }

  child.stdout.on('data', chunk => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      let message
      try {
        message = JSON.parse(line)
      } catch {
        fail('Codex app-server emitted malformed JSONL')
        return
      }
      if (message.id === undefined || message.id === null) continue
      const request = pending.get(message.id)
      if (!request) continue
      pending.delete(message.id)
      clearTimeout(request.timer)
      if (message.error) {
        request.reject(toRpcError(message.error))
      } else {
        request.resolve(message.result)
      }
    }
  })

  child.on('error', error => fail(error))
  child.on('close', (code, signal) => {
    if (!closed) {
      fail(`Codex app-server exited before completing a request (code ${code ?? 'unknown'}, signal ${signal ?? 'none'})`)
    }
  })

  const sendRequest = (method, params) => {
    if (closed) return Promise.reject(new AppServerProtocolError('Codex app-server client is closed'))

    const id = nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new AppServerProtocolError(`Codex app-server request "${method}" timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      pending.set(id, { resolve, reject, timer })
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
    })
  }

  const close = () => {
    if (!closed) {
      closed = true
      rejectPending(new Error('Codex app-server client was closed'))
    }
    stopChild()
  }

  try {
    await sendRequest('initialize', {
      clientInfo: {
        name: 'codex-session-insights',
        title: 'Codex Session Insights',
        version: '0.2.3',
      },
      capabilities: null,
    })
    child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`)
  } catch (error) {
    close()
    throw error
  }

  return {
    request(method, params) {
      if (!READ_ONLY_METHODS.has(method)) {
        return Promise.reject(new Error(`Unsupported read-only app-server method: ${method}`))
      }
      return sendRequest(method, params)
    },
    close,
  }
}

function formatRpcError(error) {
  if (typeof error?.message === 'string') return error.message
  return `Codex app-server request failed: ${JSON.stringify(error)}`
}

function toRpcError(error) {
  const code = Number(error?.code)
  const message = formatRpcError(error)
  if ([-32700, -32600, -32601, -32602].includes(code)) {
    return new AppServerProtocolError(message, { code })
  }
  /** @type {Error & { code?: number }} */
  const result = new Error(message)
  if (Number.isFinite(code)) result.code = code
  return result
}

function toProtocolError(error) {
  if (isAppServerProtocolError(error)) return error
  const message = error instanceof Error ? error.message : String(error)
  return new AppServerProtocolError(message, error instanceof Error ? { cause: error } : undefined)
}
