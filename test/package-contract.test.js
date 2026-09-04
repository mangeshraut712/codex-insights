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
  'SECURITY.md',
]

test('package declares the dependency runtime floor', async () => {
  const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'))

  assert.equal(packageJson.engines.node, '>=18.17.0')
  assert.equal(packageJson.repository.url, 'git+https://github.com/mangeshraut712/codex-insights.git')
  assert.ok(packageJson.files.includes('LICENSE'))
  assert.equal(packageJson.scripts.check, 'node ./scripts/check.mjs')
  assert.equal(packageJson.scripts.ci, 'npm test && npm run check && npm pack --dry-run')
})

test('package includes public trust and contributor contracts', async () => {
  for (const relativePath of REQUIRED_DOCS) {
    const contents = await fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8')
    assert.ok(contents.length > 100, `${relativePath} must not be a placeholder`)
  }
})

test('install and owner-auth scripts stay token-free and documented', async () => {
  const install = await fs.readFile(new URL('../scripts/install.sh', import.meta.url), 'utf8')
  const compat = await fs.readFile(new URL('../scripts/install-insights.sh', import.meta.url), 'utf8')
  const setup = await fs.readFile(new URL('../scripts/setup-github-auth.sh', import.meta.url), 'utf8')
  const check = await fs.readFile(new URL('../scripts/check-github-auth.sh', import.meta.url), 'utf8')
  const installDocs = await fs.readFile(new URL('../docs/install.md', import.meta.url), 'utf8')
  const authDocs = await fs.readFile(new URL('../docs/github-auth.md', import.meta.url), 'utf8')
  const readme = await fs.readFile(new URL('../README.md', import.meta.url), 'utf8')

  assert.match(install, /^#!/m)
  assert.match(install, /mangeshraut712\/codex-insights/)
  assert.match(install, /plugin marketplace add/)
  assert.match(install, /codex-insights@codex-insights/)
  assert.match(install, /BASH_SOURCE/)
  assert.doesNotMatch(install, /feat\/codex-insights-plugin-hardening/)
  assert.match(compat, /install\.sh/)

  assert.match(installDocs, /codex plugin marketplace add mangeshraut712\/codex-insights/)
  assert.match(installDocs, /codex plugin add codex-insights@codex-insights/)
  assert.match(installDocs, /scripts\/install\.sh/)
  assert.match(installDocs, /npx github:mangeshraut712\/codex-insights/)
  assert.match(readme, /codex plugin marketplace add mangeshraut712\/codex-insights/)
  assert.match(readme, /HEAD\/scripts\/install\.sh/)
  assert.match(readme, /npx github:mangeshraut712\/codex-insights/)
  assert.doesNotMatch(readme, /feat\/codex-insights-plugin-hardening/)
  assert.match(readme, /cosformula\/codex-session-insights/)
  assert.match(readme, /actions\/workflows\/ci.yml/)

  const workflow = await fs.readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  assert.match(workflow, /npm test/)
  assert.match(workflow, /npm run check/)

  assert.match(setup, /EXPECTED_LOGIN:-mangeshraut712/)
  assert.match(setup, /identity insteadOf/)
  assert.doesNotMatch(setup, /x-access-token:\$\{token\}/)
  assert.match(check, /HTTP 200/)
  assert.match(authDocs, /setup-github-auth\.sh/)
  assert.match(authDocs, /check-github-auth\.sh/)
})
