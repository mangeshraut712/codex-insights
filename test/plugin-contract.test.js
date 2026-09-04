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
  assert.equal(manifest.description, packageJson.description)
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
  assert.equal(marketplace.plugins[0].category, 'Productivity')
  assert.equal(marketplace.plugins[0].policy.installation, 'AVAILABLE')
  assert.equal(marketplace.plugins[0].policy.authentication, 'ON_USE')
  assert.deepEqual(marketplace.plugins[0].policy.products, ['CODEX'])
  assert.equal(marketplace.interface.displayName, 'Codex Insights')
  assert.notEqual(marketplace.name, 'openai-curated')

  assert.equal(manifest.interface.developerName, 'mangeshraut712')
  assert.notEqual(manifest.interface.developerName, 'OpenAI')
  assert.deepEqual(manifest.interface.capabilities, ['Interactive', 'Read'])
  assert.equal(manifest.interface.category, 'Productivity')
  assert.equal(manifest.interface.brandColor, '#0F766E')
  assert.equal(manifest.interface.websiteURL, 'https://github.com/mangeshraut712/codex-insights#readme')
  assert.equal(
    manifest.interface.privacyPolicyURL,
    'https://github.com/mangeshraut712/codex-insights/blob/main/docs/privacy-policy.md',
  )
  assert.equal(
    manifest.interface.termsOfServiceURL,
    'https://github.com/mangeshraut712/codex-insights/blob/main/docs/terms.md',
  )
  assert.equal(manifest.interface.composerIcon, './assets/icon.png')
  assert.equal(manifest.interface.logo, './assets/logo.png')
  assert.equal(manifest.interface.logoDark, './assets/logo-dark.png')
  assert.deepEqual(manifest.interface.screenshots, [])
  assert.equal(manifest.hooks, undefined)
  assert.equal(manifest.interface.brandColorDark, undefined)
  assert.ok(Array.isArray(manifest.interface.defaultPrompt))
  assert.ok(manifest.interface.defaultPrompt.length > 0)
  assert.ok(manifest.interface.defaultPrompt.length <= 3)
  for (const prompt of manifest.interface.defaultPrompt) {
    assert.equal(typeof prompt, 'string')
    assert.ok(prompt.trim().length > 0)
    assert.ok(prompt.length <= 128, `defaultPrompt exceeds 128 characters: ${prompt}`)
  }
  assert.equal(manifest.author.email, 'mbr63@drexel.edu')
  assert.doesNotMatch(JSON.stringify(manifest), /\[TODO:/)

  for (const relativePath of ['assets/icon.png', 'assets/logo.png', 'assets/logo-dark.png']) {
    await fs.access(new URL(relativePath, pluginRoot))
  }
})

test('insights skill declares an invocable workflow without placeholders', async () => {
  const requiredFiles = [
    'skills/insights/SKILL.md',
    'skills/insights/LICENSE.txt',
    'skills/insights/assets/icon.png',
    'skills/insights/assets/logo.png',
    'skills/insights/agents/openai.yaml',
    'skills/insights/references/report-modes.md',
    'scripts/run-insights.mjs',
    'README.md',
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
  assert.match(skill, /^license: MIT$/m)
  assert.match(skill, /estimate/i)
  assert.match(skill, /local-only/i)
  assert.match(skill, /model-assisted/i)
  assert.match(skill, /does not name a mode, use \*\*local-only\*\*/)
  assert.match(skill, /Claude Code/)
  assert.match(skill, /\$insights/)
  assert.match(skill, /## Hard limits/)
  assert.match(skill, /untrusted/i)
  assert.match(skill, /Do not use for plan billing/)
  const description = skill.match(/^description:\s*(.+)$/m)?.[1] ?? ''
  assert.ok(description.length > 0 && description.length <= 1024)
  assert.doesNotMatch(description, /[<>]/)
  assert.match(agent, /\$insights/)
  assert.match(agent, /allow_implicit_invocation: true/)
  assert.match(agent, /Do not share or upload/)
  assert.match(agent, /brand_color: "#0F766E"/)
  assert.match(skill, /version: "0\.3\.0"/)
})

test('plugin archive passes the official Codex plugin-creator validator', () => {
  const result = spawnSync(
    'python3',
    [fileURLToPath(new URL('scripts/validate_plugin.py', root)), fileURLToPath(pluginRoot)],
    { encoding: 'utf8' },
  )

  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /Plugin validation passed/)
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
