import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CODEX_PROFILE_URL, collectAccountProfile } from '../lib/account-profile.js'

async function codexHomeWithAuth(auth) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-insights-auth-'))
  if (auth) await fs.writeFile(path.join(dir, 'auth.json'), JSON.stringify(auth))
  return dir
}

function fakeClient(calls) {
  return async () => ({
    async request(method, params) {
      calls.push({ method, params })
      return { summary: { lifetimeTokens: 42, currentStreakDays: 3 }, dailyUsageBuckets: [{ startDate: '2026-09-22', tokens: 42 }] }
    },
    close() { calls.push({ method: 'close' }) },
  })
}

test('collectAccountProfile reads app-server usage first, then the Codex profile with the stored sign-in', async () => {
  const codexHome = await codexHomeWithAuth({ tokens: { access_token: 'token-123', account_id: 'acct-1' } })
  const calls = []
  const requests = []
  const account = await collectAccountProfile({
    codexHome,
    createClient: fakeClient(calls),
    fetchImpl: async (url, init) => {
      requests.push({ url, headers: init.headers })
      return {
        ok: true,
        json: async () => ({
          profile: { username: 'ada', display_name: 'Ada' },
          stats: { lifetime_tokens: 99, total_threads: 7, top_invocations: [] },
          metadata: { stats_as_of: '2026-09-22' },
        }),
      }
    },
  })

  assert.deepEqual(calls, [{ method: 'account/usage/read', params: null }, { method: 'close' }])
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, CODEX_PROFILE_URL)
  assert.equal(requests[0].headers.Authorization, 'Bearer token-123')
  assert.equal(requests[0].headers['ChatGPT-Account-Id'], 'acct-1')
  assert.equal(account.summary.lifetimeTokens, 99)
  assert.equal(account.summary.currentStreakDays, 3)
  assert.equal(account.activity.totalThreads, 7)
  assert.equal(account.username, 'ada')
  assert.doesNotMatch(JSON.stringify(account), /token-123|acct-1/)
})

test('collectAccountProfile keeps app-server stats when the profile request fails or sign-in is missing', async () => {
  const failing = await collectAccountProfile({
    codexHome: await codexHomeWithAuth({ tokens: { access_token: 'token-123' } }),
    createClient: fakeClient([]),
    fetchImpl: async () => ({ ok: false, status: 401 }),
  })
  assert.equal(failing.summary.lifetimeTokens, 42)
  assert.equal(failing.activity, null)
  assert.match(failing.warning, /HTTP 401/)

  let fetched = false
  const signedOut = await collectAccountProfile({
    codexHome: await codexHomeWithAuth(null),
    createClient: fakeClient([]),
    fetchImpl: async () => { fetched = true },
  })
  assert.equal(fetched, false)
  assert.match(signedOut.warning, /not signed in with ChatGPT/)
  assert.deepEqual(signedOut.daily, [{ date: '2026-09-22', tokens: 42 }])
})
