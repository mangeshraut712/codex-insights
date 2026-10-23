import { createReadStream } from 'node:fs'
import readline from 'node:readline'

export function emptyTokenUsage() {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
  }
}

export function extractTokenSnapshot(payload) {
  const total = payload?.info?.total_token_usage
  if (!total) return null
  return {
    inputTokens: finiteCount(total.input_tokens),
    cachedInputTokens: finiteCount(total.cached_input_tokens),
    outputTokens: finiteCount(total.output_tokens),
    reasoningOutputTokens: finiteCount(total.reasoning_output_tokens),
    totalTokens: finiteCount(total.total_tokens),
  }
}

export async function readRolloutTokenUsage(rolloutPath) {
  if (!rolloutPath) return emptyTokenUsage()
  const stream = createReadStream(rolloutPath, { encoding: 'utf8' })
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity })
  let latest = null
  try {
    for await (const line of lines) {
      if (!line.includes('"token_count"')) continue
      try {
        const event = JSON.parse(line)
        if (event.type !== 'event_msg' || event.payload?.type !== 'token_count') continue
        latest = extractTokenSnapshot(event.payload) ?? latest
      } catch {
        // Ignore malformed lines and keep the last valid snapshot.
      }
    }
  } catch {
    stream.destroy()
    return latest ?? emptyTokenUsage()
  }
  return latest ?? emptyTokenUsage()
}

function finiteCount(value) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) && number >= 0 ? number : 0
}
