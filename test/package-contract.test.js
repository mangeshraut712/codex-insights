import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'

const REQUIRED_DOCS = [
  'docs/privacy-and-trust.md',
  'docs/app-server-compatibility.md',
  'docs/contributing-analyzers.md',
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
