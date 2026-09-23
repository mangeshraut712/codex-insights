import path from 'node:path'
import { promises as fs } from 'node:fs'
import { createAppServerClient } from './app-server-client.js'

export const CODEX_PROFILE_URL = 'https://chatgpt.com/backend-api/wham/profiles/me'
const PROFILE_TIMEOUT_MS = 20_000

const count = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0
const percent = value => Number.isFinite(Number(value)) ? Math.min(100, Math.max(0, Number(value))) : null
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

/**
 * Reads account-wide Codex profile stats: the app-server first (which also refreshes the
 * ChatGPT sign-in), then the Codex profile endpoint for activity insights and top skills.
 */
export async function collectAccountProfile(options = {}) {
  const createClient = options.createClient ?? createAppServerClient
  const client = await createClient({ codexBin: options.codexBin, timeoutMs: options.appServerTimeoutMs })
  let usage
  try {
    usage = await client.request('account/usage/read', null)
  } finally {
    client.close()
  }

  let remote = null
  let warning = ''
  try {
    remote = await fetchCodexProfile({ codexHome: options.codexHome, fetchImpl: options.fetchImpl })
  } catch (error) {
    warning = `Activity insights unavailable: ${error.message}`
  }
  return normalizeAccountProfile(usage, remote, warning)
}

export async function fetchCodexProfile({ codexHome, fetchImpl = globalThis.fetch }) {
  const tokens = await readChatgptTokens(codexHome)
  const response = await fetchImpl(CODEX_PROFILE_URL, {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      ...(tokens.accountId ? { 'ChatGPT-Account-Id': tokens.accountId } : {}),
      Accept: 'application/json',
      'User-Agent': 'codex-session-insights',
    },
    signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Codex profile request failed with HTTP ${response.status}`)
  return response.json()
}

async function readChatgptTokens(codexHome) {
  let auth
  try {
    auth = JSON.parse(await fs.readFile(path.join(codexHome, 'auth.json'), 'utf8'))
  } catch {
    throw new Error('Codex is not signed in with ChatGPT on this machine')
  }
  const accessToken = auth?.tokens?.access_token
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error('Codex is not signed in with ChatGPT on this machine')
  }
  return { accessToken, accountId: typeof auth.tokens.account_id === 'string' ? auth.tokens.account_id : '' }
}

export function normalizeAccountProfile(usage, remote, warning = '') {
  const stats = remote?.stats ?? {}
  const summary = usage?.summary ?? {}
  const pick = (remoteKey, usageKey) => count(stats[remoteKey] ?? summary[usageKey])
  const buckets = Array.isArray(stats.daily_usage_buckets)
    ? stats.daily_usage_buckets.map(bucket => ({ date: bucket?.start_date, tokens: bucket?.tokens }))
    : (usage?.dailyUsageBuckets ?? []).map(bucket => ({ date: bucket?.startDate, tokens: bucket?.tokens }))
  const daily = buckets
    .filter(bucket => isDate(bucket.date))
    .map(bucket => ({ date: bucket.date, tokens: count(bucket.tokens) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const hasActivity = remote?.stats != null
  return {
    username: text(remote?.profile?.username, 40),
    displayName: text(remote?.profile?.display_name, 80),
    summary: {
      lifetimeTokens: pick('lifetime_tokens', 'lifetimeTokens'),
      peakDailyTokens: pick('peak_daily_tokens', 'peakDailyTokens'),
      longestRunningTurnSec: pick('longest_running_turn_sec', 'longestRunningTurnSec'),
      currentStreakDays: pick('current_streak_days', 'currentStreakDays'),
      longestStreakDays: pick('longest_streak_days', 'longestStreakDays'),
    },
    daily,
    activity: hasActivity
      ? {
          fastModePercent: percent(stats.fast_mode_usage_percentage),
          reasoningEffort: text(stats.most_used_reasoning_effort, 20),
          reasoningEffortPercent: percent(stats.most_used_reasoning_effort_percentage),
          skillsExplored: count(stats.unique_skills_used),
          totalSkillsUsed: count(stats.total_skills_used),
          totalThreads: count(stats.total_threads),
        }
      : null,
    invocations: (Array.isArray(stats.top_invocations) ? stats.top_invocations : [])
      .map(item => ({
        type: item?.type === 'plugin' ? 'plugin' : 'skill',
        name: text(item?.type === 'plugin' ? item?.plugin_name : item?.skill_name, 60),
        count: count(item?.usage_count),
      }))
      .filter(item => item.name && item.count)
      .slice(0, 5),
    statsAsOf: text(remote?.metadata?.stats_as_of, 40),
    warning: text(remote?.metadata?.stats_error, 200) || warning,
  }
}
