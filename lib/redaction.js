import os from 'node:os'

const OPENAI_KEY = /\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}\b/g
const GITHUB_TOKEN = /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi
const PASSWORD_ASSIGNMENT = /\b(?:password|passwd|pwd)\b\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;]+)/gi
const PRIVATE_KEY_BLOCK = /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/gi

export function redactSensitiveText(value, { homeDir = os.homedir() } = {}) {
  let text = String(value ?? '')
  let redactions = 0

  const replace = (pattern, placeholder) => {
    text = text.replace(pattern, () => {
      redactions += 1
      return placeholder
    })
  }

  replace(PRIVATE_KEY_BLOCK, '[REDACTED_PRIVATE_KEY]')
  replace(OPENAI_KEY, '[REDACTED_API_KEY]')
  replace(GITHUB_TOKEN, '[REDACTED_GITHUB_TOKEN]')
  replace(BEARER_TOKEN, '[REDACTED_BEARER_TOKEN]')
  replace(PASSWORD_ASSIGNMENT, '[REDACTED_PASSWORD]')

  const normalizedHome = String(homeDir ?? '').trim()
  if (normalizedHome) {
    replace(new RegExp(escapeRegExp(normalizedHome), 'g'), '[REDACTED_HOME]')
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
