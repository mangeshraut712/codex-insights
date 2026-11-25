import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { emptyTokenUsage, extractTokenSnapshot, readRolloutTokenUsage } from '../lib/rollout-tokens.js'

function tokenCountEvent(inputTokens, outputTokens) {
  return JSON.stringify({
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: inputTokens,
          cached_input_tokens: inputTokens / 2,
          output_tokens: outputTokens,
          reasoning_output_tokens: 0,
          total_tokens: inputTokens + outputTokens,
        },
      },
    },
  })
}

test('extractTokenSnapshot returns null without usage and sanitizes counts', () => {
  assert.equal(extractTokenSnapshot(undefined), null)
  assert.equal(extractTokenSnapshot({ info: {} }), null)
  assert.deepEqual(
    extractTokenSnapshot({
      info: {
        total_token_usage: {
          input_tokens: 12,
          cached_input_tokens: '8',
          output_tokens: -4,
          reasoning_output_tokens: null,
          total_tokens: Number.NaN,
        },
      },
    }),
    { inputTokens: 12, cachedInputTokens: 8, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 },
  )
})

test('readRolloutTokenUsage keeps the last valid snapshot and skips malformed or foreign lines', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'rollout-tokens-'))
  try {
    const file = path.join(dir, 'rollout.jsonl')
    const lines = [
      JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'hello' } }),
      'not json but mentions "token_count"',
      tokenCountEvent(100, 20),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: 900,
              cached_input_tokens: 900,
              output_tokens: 900,
              reasoning_output_tokens: 900,
              total_tokens: 1800,
            },
          },
        },
      }),
      tokenCountEvent(300, 60),
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: {} } }),
    ]
    await writeFile(file, `${lines.join('\n')}\n`)
    assert.deepEqual(await readRolloutTokenUsage(file), {
      inputTokens: 300,
      cachedInputTokens: 150,
      outputTokens: 60,
      reasoningOutputTokens: 0,
      totalTokens: 360,
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('readRolloutTokenUsage ignores a trailing token_count that is not an event_msg', async () => {
  // The foreign record is last, so accepting non-event_msg records would change the result.
  const dir = await mkdtemp(path.join(os.tmpdir(), 'rollout-tokens-'))
  try {
    const file = path.join(dir, 'rollout.jsonl')
    const foreign = JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'token_count',
        info: { total_token_usage: { input_tokens: 900, cached_input_tokens: 900, output_tokens: 900, reasoning_output_tokens: 900, total_tokens: 1800 } },
      },
    })
    await writeFile(file, `${[tokenCountEvent(300, 60), foreign].join('\n')}\n`)
    assert.deepEqual(await readRolloutTokenUsage(file), {
      inputTokens: 300,
      cachedInputTokens: 150,
      outputTokens: 60,
      reasoningOutputTokens: 0,
      totalTokens: 360,
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('readRolloutTokenUsage reports zero usage when there is nothing to read', async () => {
  assert.deepEqual(await readRolloutTokenUsage(undefined), emptyTokenUsage())
  const missing = path.join(os.tmpdir(), `codex-insights-missing-${process.pid}.jsonl`)
  assert.deepEqual(await readRolloutTokenUsage(missing), emptyTokenUsage())
})
