import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CODEX_NAMES = process.platform === 'win32' ? ['codex.cmd', 'codex.exe', 'codex'] : ['codex']

/**
 * Directories where Homebrew, npm --prefix ~/.local, cargo, and Codex itself
 * commonly install binaries. Codex Desktop / GUI skills often spawn with a
 * stripped PATH that omits these.
 */
export function commonBinDirectories(homeDir = os.homedir()) {
  return [
    path.join(homeDir, '.local', 'bin'),
    path.join(homeDir, '.npm-global', 'bin'),
    path.join(homeDir, '.cargo', 'bin'),
    path.join(homeDir, '.codex', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]
}

export function mergeLookupPath(env = process.env, homeDir = os.homedir()) {
  const delimiter = path.delimiter
  const current = typeof env.PATH === 'string' ? env.PATH : ''
  const merged = []
  const seen = new Set()
  for (const dir of [...commonBinDirectories(homeDir), ...current.split(delimiter)]) {
    if (!dir || seen.has(dir)) continue
    seen.add(dir)
    merged.push(dir)
  }
  return { ...env, PATH: merged.join(delimiter) }
}

export function resolveCodexBin(explicit, env = process.env, homeDir = os.homedir()) {
  const fromFlag = typeof explicit === 'string' ? explicit.trim() : ''
  if (fromFlag) return fromFlag
  const fromEnv = typeof env.CODEX_BIN === 'string' ? env.CODEX_BIN.trim() : ''
  if (fromEnv) return fromEnv

  const lookup = mergeLookupPath(env, homeDir).PATH.split(path.delimiter)
  for (const dir of lookup) {
    for (const name of CODEX_NAMES) {
      const candidate = path.join(dir, name)
      if (isExecutable(candidate)) return candidate
    }
  }
  return 'codex'
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}
