import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'

const REQUIRED_DOCS = [
  'docs/privacy-and-trust.md',
  'docs/app-server-compatibility.md',
  'docs/contributing-analyzers.md',
  'docs/install.md',
  'docs/github-auth.md',
  'docs/README.md',
  'CONTRIBUTING.md',
]

test('package declares the dependency runtime floor', async () => {
  const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'))

  assert.equal(packageJson.engines.node, '>=18.17.0')
})

test('package includes public trust and contributor contracts', async () => {
  for (const relativePath of REQUIRED_DOCS) {
    const contents = await fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8')
    assert.ok(contents.length > 100, `${relativePath} must not be a placeholder`)
  }
})

test('install and owner-auth scripts stay token-free and documented', async () => {
  const install = await fs.readFile(new URL('../scripts/install-insights.sh', import.meta.url), 'utf8')
  const setup = await fs.readFile(new URL('../scripts/setup-github-auth.sh', import.meta.url), 'utf8')
  const check = await fs.readFile(new URL('../scripts/check-github-auth.sh', import.meta.url), 'utf8')
  const installDocs = await fs.readFile(new URL('../docs/install.md', import.meta.url), 'utf8')
  const authDocs = await fs.readFile(new URL('../docs/github-auth.md', import.meta.url), 'utf8')

  assert.match(install, /^#!/m)
  assert.match(install, /feat\/codex-insights-plugin-hardening/)
  assert.match(install, /mangeshraut712\/codex-insights/)
  assert.match(install, /BASH_SOURCE/)
  assert.match(installDocs, /curl -fsSL https:\/\/raw\.githubusercontent\.com\/mangeshraut712\/codex-insights/)
  assert.match(installDocs, /codex plugin add codex-insights@codex-insights/)

  assert.match(setup, /EXPECTED_LOGIN:-mangeshraut712/)
  assert.match(setup, /identity insteadOf/)
  assert.doesNotMatch(setup, /x-access-token:\$\{token\}/)
  assert.match(check, /HTTP 200/)
  assert.match(authDocs, /setup-github-auth\.sh/)
  assert.match(authDocs, /check-github-auth\.sh/)
})
