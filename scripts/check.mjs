#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SKIP_DIRS = new Set([
  '.git',
  '.venv',
  '.worktrees',
  'coverage',
  'node_modules',
  'test-artifacts',
])

async function listFiles(dir, predicate) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      files.push(...(await listFiles(fullPath, predicate)))
      continue
    }
    if (predicate(entry.name, fullPath)) files.push(fullPath)
  }
  return files
}

function normalizeHref(raw) {
  let href = raw.trim()
  if (href.startsWith('<') && href.endsWith('>')) href = href.slice(1, -1).trim()
  const space = href.search(/\s/)
  if (space !== -1) href = href.slice(0, space)
  href = href.replace(/^['"]|['"]$/g, '')
  const hash = href.indexOf('#')
  if (hash === 0) return null
  if (hash !== -1) href = href.slice(0, hash)
  if (!href) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null
  try {
    return decodeURIComponent(href)
  } catch {
    return href
  }
}

function collectLocalRefs(markdown) {
  const refs = []
  const patterns = [
    /!\[[^\]]*\]\(([^)]+)\)/g,
    /(?<!!)\[(?:[^\]]*)\]\(([^)]+)\)/g,
    /<img\b[^>]*\bsrc=["']([^"']+)["']/gi,
  ]
  for (const pattern of patterns) {
    for (const match of markdown.matchAll(pattern)) {
      const href = normalizeHref(match[1] ?? '')
      if (href) refs.push(href)
    }
  }
  return refs
}

const scriptFiles = [
  ...(await listFiles(path.join(root, 'bin'), (name) => name.endsWith('.js') || name.endsWith('.mjs'))),
  ...(await listFiles(path.join(root, 'lib'), (name) => name.endsWith('.js') || name.endsWith('.mjs'))),
  ...(await listFiles(path.join(root, 'scripts'), (name) => name.endsWith('.js') || name.endsWith('.mjs'))),
  ...(await listFiles(path.join(root, 'test'), (name) => name.endsWith('.js') || name.endsWith('.mjs'))),
  path.join(root, 'plugin/codex-insights/scripts/run-insights.mjs'),
]

for (const file of scriptFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const typecheck = spawnSync('npm', ['run', 'typecheck'], { cwd: root, stdio: 'inherit', shell: false })
if (typecheck.status !== 0) process.exit(typecheck.status ?? 1)

const markdownFiles = await listFiles(
  root,
  (name) => name.endsWith('.md') || name.endsWith('.markdown'),
)
const missing = []

for (const file of markdownFiles) {
  const markdown = await readFile(file, 'utf8')
  const fromDir = path.dirname(file)
  for (const href of collectLocalRefs(markdown)) {
    const target = path.resolve(fromDir, href)
    const relative = path.relative(root, target)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      missing.push(`${path.relative(root, file)} -> ${href} (outside repository)`)
      continue
    }
    try {
      await access(target)
    } catch {
      missing.push(`${path.relative(root, file)} -> ${href}`)
    }
  }
}

if (missing.length > 0) {
  process.stderr.write('Broken relative documentation links:\n')
  for (const item of missing) process.stderr.write(`- ${item}\n`)
  process.exit(1)
}
