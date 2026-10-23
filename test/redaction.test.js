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

test('redactSensitiveText covers more credential shapes and both home-path spellings', () => {
  const homeDir = 'C:\\Users\\synthetic'
  const secrets = [
    'github_pat_11SYNTHETICFINEGRAINEDTOKENVALUE',
    'AKIA1234567890ABCDEF',
    'xoxb-synthetic-slack-token',
    'npm_SYNTHETICNPMTOKEN0123456789ABCDEFGHI',
    'aws_secret_access_key=synthetic-secret-value',
    'https://hooks.slack.com/services/T00/B00/SYNTHETIC',
  ]
  const input = [
    ...secrets,
    'https://analyst:synthetic-url-secret@example.test/repo',
    'C:/Users/synthetic/project',
    `${homeDir}\\project`,
    '/etc/passwd',
  ].join('\n')

  const result = redactSensitiveText(input, { homeDir })

  for (const secret of secrets) assert.doesNotMatch(result.text, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.doesNotMatch(result.text, /synthetic-url-secret/)
  assert.doesNotMatch(result.text, /Users\/synthetic|Users\\synthetic/)
  assert.match(result.text, /\[REDACTED_GITHUB_TOKEN\]/)
  assert.match(result.text, /\[REDACTED_AWS_KEY\]/)
  assert.match(result.text, /\[REDACTED_SLACK_TOKEN\]/)
  assert.match(result.text, /\[REDACTED_NPM_TOKEN\]/)
  assert.match(result.text, /\[REDACTED_PASSWORD\]/)
  assert.match(result.text, /\[REDACTED_SLACK_WEBHOOK\]/)
  assert.match(result.text, /https:\/\/\[REDACTED_URL_CREDENTIALS\]@example\.test\/repo/)
  assert.match(result.text, /\[REDACTED_HOME\]/)
  assert.match(result.text, /\/etc\/passwd/)

  const root = redactSensitiveText('keep /etc/passwd', { homeDir: '/' })
  assert.equal(root.text, 'keep /etc/passwd')
  assert.equal(root.redactions, 0)
})
