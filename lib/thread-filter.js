export function isSubstantiveThread(thread) {
  if (thread.userMessages < 2) return false
  if (thread.durationMinutes < 1) return false
  return Boolean(String(thread.transcriptForAnalysis || '').trim())
}

export function filterSubstantiveThreads(threadSummaries) {
  return [...threadSummaries]
    .filter(isSubstantiveThread)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}
