import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { writeReportFiles } from '../lib/report.js'
import { fixture } from '../tests/tester-army/fixture.mjs'
const f = await fixture()
const out = path.join(f.dir, 'site')
const report = await f.cli(['--local-only', '--days', '0', '--data-source', 'legacy', '--no-open', '--out-dir', out])
if (report.code) throw new Error(report.stderr)
const profile = await f.cli(['profile', '--source', 'local', '--report-json', f.report, '--name', 'Synthetic Reader', '--out-dir', path.join(out, 'profile')])
if (profile.code) throw new Error(profile.stderr)
await writeReportFiles(JSON.parse(await readFile(f.report, 'utf8')), { outDir: path.join(out, 'sample') })
const address = new URL(process.env.INSIGHTS_E2E_URL || 'http://127.0.0.1:4319')
const server = createServer(async (req, res) => {
  const routes = { '/': 'report.html', '/report.html': 'report.html', '/sample/': 'sample/report.html', '/report.json': 'report.json', '/profile/': 'profile/index.html', '/profile/profile.json': 'profile/profile.json' }
  const file = routes[new URL(req.url, address).pathname]
  if (!file) { res.writeHead(404).end('Not found'); return }
  try { res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8'); res.end(await readFile(path.join(out, file))) }
  catch { res.writeHead(500).end('Fixture unavailable') }
})
server.listen(Number(address.port), address.hostname)
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(async () => { await f.cleanup(); process.exit(0) }))
