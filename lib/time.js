/**
 * Normalize a Codex timestamp to epoch milliseconds.
 * Session data uses epoch seconds, epoch milliseconds, or ISO strings depending on the reader.
 * @param {unknown} value
 * @returns {number | null}
 */
export function toEpochMs(value) {
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) return fromNumericTimestamp(Number(trimmed))
    const parsed = Date.parse(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (typeof value === 'number') return fromNumericTimestamp(value)
  return null
}

/**
 * @param {number} value
 * @returns {number | null}
 */
function fromNumericTimestamp(value) {
  if (!Number.isFinite(value) || value <= 0) return null
  // Milliseconds since the epoch are ~1e12. Smaller positive numbers are seconds.
  if (value >= 1e12) return value
  return value * 1000
}
