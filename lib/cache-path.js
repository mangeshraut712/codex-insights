import crypto from 'node:crypto'
import path from 'node:path'
import { promises as fs } from 'node:fs'

const PRIVATE_CACHE_FILE_MODE = 0o600

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

export async function writePrivateCacheJson(filePath, value) {
  const data = JSON.stringify(value, null, 2)
  const handle = await fs.open(filePath, 'w', PRIVATE_CACHE_FILE_MODE)
  try {
    await handle.chmod(PRIVATE_CACHE_FILE_MODE)
    await handle.writeFile(data, 'utf8')
  } finally {
    await handle.close()
  }
}
