import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
export const LAUNCH_AGENT_LABEL = 'com.mangeshraut712.codex-insights.auto'

const escapeXml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char])

export function schedulePaths(homeDir = os.homedir()) {
  return {
    plistPath: path.join(homeDir, 'Library', 'LaunchAgents', `${LAUNCH_AGENT_LABEL}.plist`),
    logPath: path.join(homeDir, '.codex', 'usage-data', 'auto-update.log'),
  }
}

export function buildLaunchAgentPlist({ nodePath, cliPath, autoArgs, intervalHours, logPath, homeDir = os.homedir() }) {
  const pathEntries = [
    path.dirname(nodePath),
    path.join(homeDir, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ]
  const args = [nodePath, cliPath, 'auto', ...autoArgs].map(arg => `    <string>${escapeXml(arg)}</string>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${escapeXml([...new Set(pathEntries)].join(':'))}</string>
  </dict>
  <key>StartInterval</key>
  <integer>${Math.round(intervalHours * 3600)}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${escapeXml(logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(logPath)}</string>
</dict>
</plist>
`
}

async function launchctl(args, run) {
  try {
    await run('launchctl', args)
    return true
  } catch {
    return false
  }
}

function assertMacOs(platform) {
  if (platform !== 'darwin') {
    throw new Error('Scheduling is supported on macOS. On Linux, add a cron entry such as: 0 */12 * * * codex-session-insights auto --repo owner/name')
  }
}

const defaultRun = (command, args) => execFileAsync(command, args)

export async function installSchedule(options) {
  const { platform = process.platform, run = defaultRun, homeDir = os.homedir() } = options
  assertMacOs(platform)
  const { plistPath, logPath } = schedulePaths(homeDir)
  await fs.mkdir(path.dirname(plistPath), { recursive: true })
  await fs.mkdir(path.dirname(logPath), { recursive: true })
  await fs.writeFile(plistPath, buildLaunchAgentPlist({ ...options, logPath, homeDir }), 'utf8')
  const domain = `gui/${process.getuid?.() ?? 501}`
  await launchctl(['bootout', `${domain}/${LAUNCH_AGENT_LABEL}`], run)
  if (!(await launchctl(['bootstrap', domain, plistPath], run))) {
    throw new Error(`launchctl could not load ${plistPath}`)
  }
  return { plistPath, logPath }
}

export async function removeSchedule({ platform = process.platform, run = defaultRun, homeDir = os.homedir() } = {}) {
  assertMacOs(platform)
  const { plistPath } = schedulePaths(homeDir)
  await launchctl(['bootout', `gui/${process.getuid?.() ?? 501}/${LAUNCH_AGENT_LABEL}`], run)
  await fs.rm(plistPath, { force: true })
  return { plistPath }
}

export async function readScheduleStatus({ homeDir = os.homedir() } = {}) {
  const { plistPath, logPath } = schedulePaths(homeDir)
  const plist = await fs.readFile(plistPath, 'utf8').catch(() => '')
  const log = await fs.readFile(logPath, 'utf8').catch(() => '')
  const interval = Number(plist.match(/<key>StartInterval<\/key>\s*<integer>(\d+)<\/integer>/)?.[1] ?? 0)
  return {
    installed: Boolean(plist),
    plistPath,
    logPath,
    intervalHours: interval ? interval / 3600 : null,
    recentLog: log.trim().split('\n').slice(-8).join('\n'),
  }
}
