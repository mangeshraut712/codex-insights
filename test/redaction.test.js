import test from 'node:test'
import assert from 'node:assert/strict'
import { redactSensitiveText, redactSessionSummary } from '../lib/redaction.js'

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

  assert.equal(result.text, [
    '[REDACTED_GITHUB_TOKEN]',
    '[REDACTED_AWS_KEY]',
    '[REDACTED_SLACK_TOKEN]',
    '[REDACTED_NPM_TOKEN]',
    '[REDACTED_PASSWORD]',
    '[REDACTED_SLACK_WEBHOOK]',
    'https://[REDACTED_URL_CREDENTIALS]@example.test/repo',
    '[REDACTED_HOME]/project',
    '[REDACTED_HOME]\\project',
    '/etc/passwd',
  ].join('\n'))
  assert.equal(result.redactions, 9)

  const root = redactSensitiveText('keep /etc/passwd', { homeDir: '/' })
  assert.equal(root.text, 'keep /etc/passwd')
  assert.equal(root.redactions, 0)
})

test('redactSensitiveText matches slack webhook dots as literal hostname characters', () => {
  const webhook = 'https://hooks.slack.com/services/T00/B00/SYNTHETIC'
  const anyCharacterHost = 'https://hooksXslackYcom/services/T00/B00/SYNTHETIC'
  const dottedSuffixHost = 'https://hooks.slack.com.attacker.test/services/T00/B00/SYNTHETIC'
  const result = redactSensitiveText([webhook, anyCharacterHost, dottedSuffixHost].join('\n'))

  assert.equal(result.text, ['[REDACTED_SLACK_WEBHOOK]', anyCharacterHost, dottedSuffixHost].join('\n'))
  assert.equal(result.redactions, 1)
})

test('redactSensitiveText redacts quoted JSON password keys', () => {
  const result = redactSensitiveText('{"password": "hunter2-synthetic", "pwd":"other-synthetic"}')

  assert.equal(result.text, '{[REDACTED_PASSWORD], [REDACTED_PASSWORD]}')
  assert.equal(result.redactions, 2)
})

test('redactSensitiveText leaves quoted keys that only end in -password alone', () => {
  const result = redactSensitiveText('{"forgot-password": "/account/recover", "password": "synthetic-secret"}')

  assert.equal(result.text, '{"forgot-password": "/account/recover", [REDACTED_PASSWORD]}')
  assert.equal(result.redactions, 1)
})

test('redactSessionSummary keeps a seeded JSON password out of the serialized summary', () => {
  const summary = redactSessionSummary({
    firstMessage: 'config is {"password": "seeded-json-secret"}',
    transcript: [{ role: 'user', text: "{'pwd': 'seeded-yaml-secret'}" }],
  })

  const serialized = JSON.stringify(summary)
  assert.doesNotMatch(serialized, /seeded-json-secret|seeded-yaml-secret/)
  assert.equal(summary.redactions, 2)
})

test('redactSensitiveText only redacts the home directory as a whole path segment', () => {
  const result = redactSensitiveText('/Users/bob/app /Users/bobby/app /Users/bob.', { homeDir: '/Users/bob' })

  assert.equal(result.text, '[REDACTED_HOME]/app /Users/bobby/app [REDACTED_HOME].')
  assert.equal(result.redactions, 2)
})

test('redactSensitiveText covers Google, Stripe and Hugging Face keys and env-style secret assignments', () => {
  const secrets = {
    google: 'AIzaSySYNTHETICgoogleKEY0123456789abcdE',
    stripe: 'sk_live_SYNTHETICstripeKEY0123',
    stripeRestricted: 'rk_test_SYNTHETICstripeKEY0123',
    huggingface: 'hf_SYNTHETICHUGGINGFACETOKEN0123456789',
    openrouter: 'synthetic-openrouter-value-123',
    sentry: 'synthetic-sentry-auth-value',
  }
  const input = [
    `GEMINI_API_KEY=${secrets.google}`,
    `stripe ${secrets.stripe} and ${secrets.stripeRestricted}`,
    `token ${secrets.huggingface}`,
    `OPENROUTER_API_KEY=${secrets.openrouter}`,
    `SENTRY_AUTH_TOKEN: "${secrets.sentry}"`,
  ].join('\n')

  const result = redactSensitiveText(input)

  for (const secret of Object.values(secrets)) {
    assert.doesNotMatch(result.text, new RegExp(secret))
  }
  assert.equal(result.text, [
    'GEMINI_API_KEY=[REDACTED_API_KEY]',
    'stripe [REDACTED_API_KEY] and [REDACTED_API_KEY]',
    'token [REDACTED_HF_TOKEN]',
    'OPENROUTER_API_KEY=[REDACTED_SECRET]',
    'SENTRY_AUTH_TOKEN: [REDACTED_SECRET]',
  ].join('\n'))
  assert.equal(result.redactions, 6)
})

test('env-style secret redaction leaves variable references and short config values alone', () => {
  const input = [
    'GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}',
    'OPENAI_API_KEY=$OPENAI_API_KEY',
    'MAX_TOKENS=4096',
    'CSRF_TOKEN=on',
  ].join('\n')

  const result = redactSensitiveText(input)

  assert.equal(result.text, input)
  assert.equal(result.redactions, 0)
})

test('env-style secret redaction never splits a credential URL whose password has a comma or semicolon', () => {
  const input = 'SERVICE_SECRET=https://alice:password;remaining-secret@example.test/path'

  const result = redactSensitiveText(input)

  assert.doesNotMatch(result.text, /remaining-secret|password/)
  assert.equal(result.text, 'SERVICE_SECRET=[REDACTED_SECRET]')
})

test('env-style secret redaction stays on its line and covers quoted keys, literal quotes and commas', () => {
  const input = [
    'OPENROUTER_API_KEY=',
    'DATABASE_HOST=db.internal.example',
    '"SERVICE_TOKEN": "synthetic-yaml-token-value"',
    "DEPLOY_SECRET='$synthetic-literal-dollar'",
    'WEBHOOK_SECRET=[synthetic-bracket-value]',
    'APP_SECRET=abc,synthetic-after-comma',
    'see SENTRY_AUTH_TOKEN=synthetic-sentry-value, then rerun',
  ].join('\n')

  const result = redactSensitiveText(input)

  assert.equal(result.text, [
    'OPENROUTER_API_KEY=',
    'DATABASE_HOST=db.internal.example',
    '"SERVICE_TOKEN": [REDACTED_SECRET]',
    'DEPLOY_SECRET=[REDACTED_SECRET]',
    'WEBHOOK_SECRET=[REDACTED_SECRET]',
    'APP_SECRET=[REDACTED_SECRET]',
    'see SENTRY_AUTH_TOKEN=[REDACTED_SECRET], then rerun',
  ].join('\n'))
  assert.equal(result.redactions, 5)
})

test('redactSessionSummary keeps the new key shapes out of the serialized summary', () => {
  const summary = redactSessionSummary({
    firstMessage: 'GEMINI_API_KEY=AIzaSySYNTHETICgoogleKEY0123456789abcdE',
    transcript: [
      { role: 'user', text: 'stripe sk_live_SYNTHETICstripeKEY0123 hf_SYNTHETICHUGGINGFACETOKEN0123456789' },
      { role: 'assistant', text: 'OPENROUTER_API_KEY=synthetic-openrouter-value-123' },
    ],
  })

  const serialized = JSON.stringify(summary)
  assert.doesNotMatch(serialized, /SYNTHETIC|synthetic-openrouter/)
  assert.equal(summary.redactions, 4)
})
