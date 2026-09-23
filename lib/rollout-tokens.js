import { promises as fs } from 'node:fs'

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
    inputTokens: Number(total.input_tokens ?? 0),
    cachedInputTokens: Number(total.cached_input_tokens ?? 0),
    outputTokens: Number(total.output_tokens ?? 0),
    reasoningOutputTokens: Number(total.reasoning_output_tokens ?? 0),
    totalTokens: Number(total.total_tokens ?? 0),
  }
}

export async function readRolloutTokenUsage(rolloutPath) {
  if (!rolloutPath) return emptyTokenUsage()
  let raw
  try {
    raw = await fs.readFile(rolloutPath, 'utf8')
  } catch {
    return emptyTokenUsage()
  }
  let latest = null
  for (const line of raw.split('\n')) {
    if (!line.includes('"token_count"')) continue
    try {
      const event = JSON.parse(line)
      if (event.type !== 'event_msg' || event.payload?.type !== 'token_count') continue
      latest = extractTokenSnapshot(event.payload) ?? latest
    } catch {
      // Ignore malformed lines and keep the last valid snapshot.
    }
  }
  return latest ?? emptyTokenUsage()
}
