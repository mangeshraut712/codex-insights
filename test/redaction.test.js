import test from 'node:test'
import assert from 'node:assert/strict'
import { redactSensitiveText } from '../lib/redaction.js'

test('redactSensitiveText removes synthetic secrets and home paths', () => {
  const homeDir = '/Users/synthetic-analyst'
  const secrets = {
    openai: 'sk-proj-SYNTHETICOPENAIKEY1234567890',
    github: 'ghp_SYNTHETICGITHUBTOKEN1234567890',
    bearer: 'SYNTHETICBEARERTOKEN1234567890',
    password: 'synthetic-password-value',
    privateKey: 'SYNTHETIC_PRIVATE_KEY_BODY',
  }
  const input = [
    `openai=${secrets.openai}`,
    `github=${secrets.github}`,
    `Authorization: Bearer ${secrets.bearer}`,
    `password="${secrets.password}"`,
    `-----BEGIN PRIVATE KEY-----\n${secrets.privateKey}\n-----END PRIVATE KEY-----`,
    `${homeDir}/private/project/.env`,
  ].join('\n')

  const result = redactSensitiveText(input, { homeDir })

  for (const secret of Object.values(secrets)) {
    assert.doesNotMatch(result.text, new RegExp(secret))
  }
  assert.doesNotMatch(result.text, new RegExp(homeDir))
  assert.match(result.text, /\[REDACTED_API_KEY\]/)
  assert.match(result.text, /\[REDACTED_GITHUB_TOKEN\]/)
  assert.match(result.text, /\[REDACTED_BEARER_TOKEN\]/)
  assert.match(result.text, /\[REDACTED_PASSWORD\]/)
  assert.match(result.text, /\[REDACTED_PRIVATE_KEY\]/)
  assert.match(result.text, /\[REDACTED_HOME\]\/private\/project/)
  assert.equal(result.redactions, 6)
})
