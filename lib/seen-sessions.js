import path from 'node:path'
import { promises as fs } from 'node:fs'
import { filterSubstantiveThreads, isSubstantiveThread } from './thread-filter.js'
import { redactSessionSummary } from './redaction.js'
import { writePrivateCacheJson } from './cache-path.js'

export const SEEN_SESSIONS_SCHEMA_VERSION = 2

export function createCoverage(dataSource) {
  return {
    dataSource,
    discovered: 0,
    eligible: 0,
    analyzed: 0,
    excludedShort: 0,
    excludedSource: 0,
    failedToRead: 0,
    sampled: 0,
    unseen: 0,
    unseenAnalyzed: 0,
    reused: 0,
    excludedUnseenOverCap: 0,
    warnings: [],
  }
}

export function fingerprintUpdatedAt(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? String(Math.trunc(value)) : String(Math.trunc(value / 1000))
  }
  const ms = Date.parse(String(value))
  if (!Number.isFinite(ms)) return String(value)
  return String(Math.trunc(ms / 1000))
}

export function seenStorePath(usageDataDir) {
  return path.join(usageDataDir, 'seen-sessions.json')
}

export function archivedSummaryPath(usageDataDir, threadId) {
  return path.join(usageDataDir, 'session-summaries', `${encodeURIComponent(String(threadId))}.json`)
}

export async function loadSeenStore(usageDataDir) {
  if (!usageDataDir) return emptySeenStore()
  try {
    const payload = JSON.parse(await fs.readFile(seenStorePath(usageDataDir), 'utf8'))
    if (payload?.schemaVersion !== SEEN_SESSIONS_SCHEMA_VERSION || !payload.sessions) {
      return emptySeenStore()
    }
    return { schemaVersion: SEEN_SESSIONS_SCHEMA_VERSION, sessions: payload.sessions }
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return emptySeenStore()
    throw error
  }
}

export function canReuseSeenSession(store, threadId, updatedAt) {
  const entry = store?.sessions?.[String(threadId)]
  if (!entry) return false
  return fingerprintUpdatedAt(entry.updatedAt) === fingerprintUpdatedAt(updatedAt)
}

export async function readArchivedSummary(usageDataDir, threadId, redactionOptions = {}) {
  if (!usageDataDir) return null
  const filePath = archivedSummaryPath(usageDataDir, threadId)
  try {
    const payload = JSON.parse(await fs.readFile(filePath, 'utf8'))
    if (!payload?.summary) return null
    const summary = redactSessionSummary(payload.summary, redactionOptions)
    await writePrivateCacheJson(filePath, { ...payload, summary })
    return summary
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return null
    throw error
  }
}

export async function persistAnalyzedSessions(usageDataDir, summaries, options = {}) {
  if (!usageDataDir) return emptySeenStore()
  const store = options.store ?? (await loadSeenStore(usageDataDir))
  const analyzedAt = options.analyzedAt ?? new Date().toISOString()
  await fs.mkdir(path.join(usageDataDir, 'session-summaries'), { recursive: true })
  const journaled = new Set()
  for (const summary of summaries ?? []) {
    const id = String(summary.id)
    const sanitizedSummary = redactSessionSummary(summary, options)
    journaled.add(id)
    store.sessions[id] = {
      updatedAt: fingerprintUpdatedAt(summary.updatedAt),
      analyzedAt,
    }
    await writePrivateCacheJson(
      archivedSummaryPath(usageDataDir, id),
      { summary: sanitizedSummary },
    )
  }
  for (const seen of options.alsoSeen ?? []) {
    const id = String(seen.id)
    if (journaled.has(id)) continue
    journaled.add(id)
    store.sessions[id] = {
      updatedAt: fingerprintUpdatedAt(seen.updatedAt),
      analyzedAt,
    }
  }
  await writePrivateCacheJson(seenStorePath(usageDataDir), store)
  return store
}

export async function loadUnseenAwarePopulation(options) {
  const coverage = options.coverage
  const unseenLimit = Number(options.unseenLimit || 0)
  const store = options.reanalyze ? emptySeenStore() : await loadSeenStore(options.usageDataDir)
  const reused = []
  const fresh = []
  const seenEntries = []
  let unseenEligible = 0
  let unseenAnalyzed = 0
  let excludedShort = 0
  let failedToRead = 0
  let sampled = 0
  let excludedUnseenOverCap = 0

  for (const thread of options.eligibleThreads) {
    const threadId = String(thread.id)
    const updatedAt = thread.updatedAt
    const reusable =
      !options.reanalyze && canReuseSeenSession(store, threadId, updatedAt)
    if (reusable) {
      const cached = await readArchivedSummary(options.usageDataDir, threadId, {
        homeDir: options.homeDir,
      })
      if (cached && isSubstantiveThread(cached)) {
        reused.push(cached)
        continue
      }
    }

    unseenEligible += 1
    if (unseenLimit > 0 && unseenAnalyzed >= unseenLimit) {
      excludedUnseenOverCap += 1
      continue
    }

    sampled += 1
    try {
      const summary = await options.readSummary(thread)
      if (isSubstantiveThread(summary)) {
        fresh.push(summary)
        unseenAnalyzed += 1
      } else {
        excludedShort += 1
        seenEntries.push({ id: threadId, updatedAt })
      }
    } catch (error) {
      if (options.isFatalReadError?.(error)) throw error
      failedToRead += 1
    }
  }

  const summaries = filterSubstantiveThreads([...reused, ...fresh])
  coverage.analyzed = summaries.length
  coverage.reused = reused.length
  coverage.unseen = unseenEligible
  coverage.unseenAnalyzed = unseenAnalyzed
  coverage.excludedShort = excludedShort
  coverage.failedToRead = failedToRead
  coverage.sampled = sampled + reused.length
  coverage.excludedUnseenOverCap = excludedUnseenOverCap
  return { summaries, coverage, seenEntries }
}

function emptySeenStore() {
  return { schemaVersion: SEEN_SESSIONS_SCHEMA_VERSION, sessions: {} }
}
