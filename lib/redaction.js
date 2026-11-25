import path from 'node:path'

const OPENAI_KEY = /\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}\b/g
const GITHUB_TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b/g
const AWS_ACCESS_KEY = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g
const SLACK_TOKEN = /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g
const SLACK_WEBHOOK = /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/gi
const NPM_TOKEN = /\bnpm_[A-Za-z0-9]{36}\b/g
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi
const PASSWORD_ASSIGNMENT = /\b(?:password|passwd|pwd|aws_secret_access_key|secret_access_key)\b\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;]+)/gi
// A JSON or YAML key such as "password": "...". The key must be the whole quoted
// string, so "forgot-password": "/account/recover" is left alone.
const QUOTED_PASSWORD_KEY = /(?<![\w-])(["'])(?:password|passwd|pwd|aws_secret_access_key|secret_access_key)\1\s*:\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/gi
const GOOGLE_API_KEY = /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g
const STRIPE_SECRET_KEY = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g
const HUGGINGFACE_TOKEN = /\bhf_[A-Za-z0-9]{30,}\b/g
// Upper-case env-style assignments such as OPENROUTER_API_KEY=... or SENTRY_AUTH_TOKEN: ...
// The key may be quoted (YAML/JSON). The separator never crosses a line, so an empty
// assignment cannot swallow the next setting. Already-redacted values and variable
// references ($X, "${X}", ${{ ... }}) are left alone; single quotes are literal, so
// '$...' is still redacted. Unquoted values run to whitespace (commas included) and
// drop only one trailing punctuation mark.
const ENV_SECRET_ASSIGNMENT = /(?<![\w-])(["']?)((?:[A-Z][A-Z0-9_]*)?(?:API_KEY|SECRET|SECRET_KEY|ACCESS_TOKEN|AUTH_TOKEN|TOKEN))\1([ \t]*[:=][ \t]*)(?:"(?!\[REDACTED|\$)(?:\\.|[^"\\\n])+"|'(?!\[REDACTED)(?:\\.|[^'\\\n])+'|(?!\[REDACTED|[$"'])(?=\S{8,})\S+?(?=[,;.)]?(?:\s|$)))/g
const PRIVATE_KEY_BLOCK = /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/gi
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi

/**
 * @param {unknown} value
 * @param {{ homeDir?: string }=} [options]
 */
export function redactSensitiveText(value, { homeDir } = {}) {
  let text = String(value ?? '')
  let redactions = 0

  const replace = (pattern, replacement) => {
    pattern.lastIndex = 0
    text = text.replace(pattern, (...args) => {
      redactions += 1
      return typeof replacement === 'function' ? replacement(...args) : replacement
    })
  }

  replace(PRIVATE_KEY_BLOCK, '[REDACTED_PRIVATE_KEY]')
  replace(OPENAI_KEY, '[REDACTED_API_KEY]')
  replace(GITHUB_TOKEN, '[REDACTED_GITHUB_TOKEN]')
  replace(AWS_ACCESS_KEY, '[REDACTED_AWS_KEY]')
  replace(SLACK_TOKEN, '[REDACTED_SLACK_TOKEN]')
  replace(SLACK_WEBHOOK, '[REDACTED_SLACK_WEBHOOK]')
  replace(NPM_TOKEN, '[REDACTED_NPM_TOKEN]')
  replace(BEARER_TOKEN, '[REDACTED_BEARER_TOKEN]')
  replace(GOOGLE_API_KEY, '[REDACTED_API_KEY]')
  replace(STRIPE_SECRET_KEY, '[REDACTED_API_KEY]')
  replace(HUGGINGFACE_TOKEN, '[REDACTED_HF_TOKEN]')
  replace(QUOTED_PASSWORD_KEY, '[REDACTED_PASSWORD]')
  replace(PASSWORD_ASSIGNMENT, '[REDACTED_PASSWORD]')
  replace(URL_CREDENTIALS, (_match, scheme) => `${scheme}[REDACTED_URL_CREDENTIALS]@`)
  // After URL credentials, so a password containing , or ; is never split by this pass.
  replace(ENV_SECRET_ASSIGNMENT, (_match, quote, key, separator) => `${quote}${key}${quote}${separator}[REDACTED_SECRET]`)

  for (const variant of homePathVariants(homeDir)) {
    const boundary = /[\\/]$/.test(variant) ? '' : '(?![\\w-])'
    replace(new RegExp(`${escapeRegExp(variant)}${boundary}`, 'g'), '[REDACTED_HOME]')
  }

  return { text, redactions }
}

export function redactSensitiveValue(value, options) {
  if (typeof value === 'string') {
    const result = redactSensitiveText(value, options)
    return { value: result.text, redactions: result.redactions }
  }
  if (Array.isArray(value)) {
    let redactions = 0
    const items = value.map(item => {
      const result = redactSensitiveValue(item, options)
      redactions += result.redactions
      return result.value
    })
    return { value: items, redactions }
  }
  if (value && typeof value === 'object') {
    let redactions = 0
    const entries = Object.entries(value).map(([key, item]) => {
      const result = redactSensitiveValue(item, options)
      redactions += result.redactions
      return [key, result.value]
    })
    return { value: Object.fromEntries(entries), redactions }
  }
  return { value, redactions: 0 }
}

export function redactSessionSummary(summary, options) {
  const existingRedactions = Number(summary?.redactions ?? 0)
  const { value, redactions } = redactSensitiveValue(summary, options)
  return {
    ...value,
    redactions: existingRedactions + redactions,
  }
}

/**
 * @param {unknown} homeDir
 * @returns {string[]}
 */
function homePathVariants(homeDir) {
  const normalized = String(homeDir ?? '').trim()
  if (!normalized) return []
  const looksWindows = /^[A-Za-z]:[\\/]/.test(normalized) || normalized.startsWith('\\\\')
  const parser = looksWindows ? path.win32 : path.posix
  const root = parser.parse(normalized).root
  if (!root || parser.normalize(normalized) === parser.normalize(root)) return []
  const forward = normalized.replaceAll('\\', '/')
  const backward = forward.replaceAll('/', '\\')
  return [...new Set([normalized, forward, backward].filter(variant => variant.length > root.length))]
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
