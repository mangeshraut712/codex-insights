import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const pluginRoot = new URL('../plugin/codex-insights/', import.meta.url)

test('plugin manifest and package publication metadata stay aligned', async () => {
  const packageJson = JSON.parse(await fs.readFile(new URL('package.json', root), 'utf8'))
  const manifest = JSON.parse(
    await fs.readFile(new URL('.codex-plugin/plugin.json', pluginRoot), 'utf8'),
  )

  assert.equal(manifest.name, 'codex-insights')
  assert.equal(manifest.version, packageJson.version.split('-')[0])
  assert.equal(manifest.license, 'MIT')
  assert.equal(manifest.homepage, 'https://github.com/mangeshraut712/codex-insights#readme')
  assert.equal(manifest.repository, 'https://github.com/mangeshraut712/codex-insights')
  assert.equal(manifest.skills, './skills/')
  assert.equal(manifest.mcpServers, undefined)
  assert.equal(manifest.apps, undefined)
  assert.ok(packageJson.files.includes('plugin'))

  const marketplace = JSON.parse(
    await fs.readFile(new URL('.agents/plugins/marketplace.json', root), 'utf8'),
  )
  assert.equal(marketplace.name, 'codex-insights')
  assert.equal(marketplace.plugins[0].name, 'codex-insights')
  assert.equal(marketplace.plugins[0].source.path, './plugin/codex-insights')
  assert.equal(marketplace.plugins[0].source.source, 'local')
})

test('insights skill declares an invocable workflow without placeholders', async () => {
  const requiredFiles = [
    'skills/insights/SKILL.md',
    'skills/insights/agents/openai.yaml',
    'skills/insights/references/report-modes.md',
    'scripts/run-insights.mjs',
  ]

  for (const relativePath of requiredFiles) {
    const contents = await fs.readFile(new URL(relativePath, pluginRoot), 'utf8')
    assert.doesNotMatch(contents, /\[TODO:|PLACEHOLDER/i)
  }

  const skill = await fs.readFile(new URL('skills/insights/SKILL.md', pluginRoot), 'utf8')
  const agent = await fs.readFile(
    new URL('skills/insights/agents/openai.yaml', pluginRoot),
    'utf8',
  )
  assert.match(skill, /^---\nname: insights\n/m)
  assert.match(skill, /estimate/i)
  assert.match(skill, /local-only/i)
  assert.match(skill, /model-assisted/i)
  assert.match(skill, /does not name a mode, use \*\*local-only\*\*/)
  assert.match(skill, /Claude Code/)
  assert.match(skill, /\$insights/)
  assert.match(agent, /\$insights/)
  assert.match(agent, /allow_implicit_invocation: true/)
})

test('plugin wrapper falls back to the repository CLI', () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('scripts/run-insights.mjs', pluginRoot)), '--help'],
    {
      cwd: fileURLToPath(root),
      encoding: 'utf8',
      env: { ...process.env, PATH: '' },
    },
  )

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /codex-session-insights/)
  assert.match(result.stdout, /--local-only/)
})
