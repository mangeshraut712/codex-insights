import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createSampleReport } from '../../test/fixtures/sample-report.js'
const exec = promisify(execFile)
export const root = process.cwd()
export async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'codex-insights-synthetic-'))
  const home = path.join(dir, 'home')
  await mkdir(home)
  const rollout = path.join(home, 'synthetic.jsonl')
  const events = [
    { timestamp: '2026-04-01T10:00:00Z', type: 'event_msg', payload: { type: 'user_message', message: 'Fix the synthetic parser fixture.' } },
    { timestamp: '2026-04-01T10:00:30Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ text: 'Inspecting the synthetic parser.' }] } },
    { timestamp: '2026-04-01T10:02:00Z', type: 'event_msg', payload: { type: 'user_message', message: 'Verify the synthetic parser works.' } },
    { timestamp: '2026-04-01T10:03:00Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ text: 'Synthetic checks passed.' }] } },
  ]
  await writeFile(rollout, events.map(e => JSON.stringify(e)).join('\n'))
  const quote = value => "'" + String(value).replaceAll("'", "''") + "'"
  await exec('sqlite3', [path.join(home, 'state_1.sqlite'), `CREATE TABLE threads (id TEXT, rollout_path TEXT, created_at INTEGER, updated_at INTEGER, source TEXT, model_provider TEXT, cwd TEXT, title TEXT, tokens_used INTEGER, archived INTEGER, git_branch TEXT, cli_version TEXT, first_user_message TEXT, model TEXT, reasoning_effort TEXT, agent_role TEXT, agent_nickname TEXT, agent_path TEXT); INSERT INTO threads VALUES ('synthetic',${quote(rollout)},1775037600,1775037780,'cli','openai','/synthetic/project','Synthetic parser',100,0,'main','0.1','Fix synthetic parser','synthetic-model','','','','');`])
  const report = path.join(dir, 'sample-report.json')
  await writeFile(report, JSON.stringify(createSampleReport()))
  return { dir, home, report, cleanup: () => rm(dir, { recursive: true, force: true }),
    cli: async args => {
      try { const r = await exec(process.execPath, [path.join(root, 'bin/codex-insights.js'), '--codex-home', home, ...args], { cwd: root, env: { ...process.env, CI: '1' }, maxBuffer: 8 * 1024 * 1024 }); return { ...r, code: 0 } }
      catch (e) { return { stdout: e.stdout || '', stderr: e.stderr || '', code: e.code } }
    } }
}
