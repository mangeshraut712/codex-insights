import { toEpochMs } from './time.js'

export function isSubstantiveThread(thread) {
  const messages = Number(thread?.userMessages)
  const duration = Number(thread?.durationMinutes)
  if (!Number.isFinite(messages) || messages < 2) return false
  if (!Number.isFinite(duration) || duration < 1) return false
  return Boolean(String(thread?.transcriptForAnalysis || '').trim())
}

export function filterSubstantiveThreads(threadSummaries) {
  return [...threadSummaries].filter(isSubstantiveThread).sort(compareThreadsDesc)
}

function compareThreadsDesc(left, right) {
  const leftMs = toEpochMs(left?.updatedAt)
  const rightMs = toEpochMs(right?.updatedAt)
  if (leftMs != null && rightMs != null && leftMs !== rightMs) return rightMs - leftMs
  if ((leftMs != null) !== (rightMs != null)) return leftMs != null ? -1 : 1
  return String(left?.id ?? '').localeCompare(String(right?.id ?? ''))
}
