import crypto from 'node:crypto'
import path from 'node:path'

/**
 * Cache file for a session id that cannot escape `cacheDir`.
 * Ids come from local Codex data and are not filenames.
 * @param {string} cacheDir
 * @param {unknown} id
 */
export function cacheFilePath(cacheDir, id) {
  const root = path.resolve(cacheDir)
  const text = String(id ?? 'unknown')
  const encoded = encodeURIComponent(text)
  const safeName = encoded.length > 0 && encoded.length <= 120 && !encoded.includes('..') && !encoded.includes('/') && !encoded.includes('\\')
    ? encoded
    : `h-${crypto.createHash('sha256').update(text).digest('hex')}`
  const filePath = path.resolve(root, `${safeName}.json`)
  const relative = path.relative(root, filePath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Refusing to write a cache file outside the cache directory')
  }
  return filePath
}
