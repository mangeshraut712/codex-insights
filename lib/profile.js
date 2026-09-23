import path from 'node:path'
import { promises as fs } from 'node:fs'

const number = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const compact = value => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(number(value))

export function buildPublicProfile(report, options = {}) {
  if (!report || !report.metadata || !report.summary) throw new Error('A valid report.json is required.')
  const name = String(options.name || 'Codex user').trim().slice(0, 80)
  const handle = String(options.handle || '').trim().replace(/^@/, '').slice(0, 40)
  const coverage = report.metadata.coverage || {}
  const activity = Array.isArray(report.charts?.activityDays) ? report.charts.activityDays : []
  const activityDays = activity.filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day?.date) && number(day.sessions) > 0)
    .map(day => ({ date: day.date, sessions: number(day.sessions) })).slice(-366)
  const models = Array.isArray(report.charts?.models) ? report.charts.models : []
  return {
    name,
    handle,
    generatedAt: String(report.metadata.generatedAt || ''),
    scopeDays: report.metadata.days === null ? null : number(report.metadata.days),
    dateRange: { start: String(report.metadata.dateRange?.start || ''), end: String(report.metadata.dateRange?.end || '') },
    sessions: number(coverage.analyzed ?? report.metadata.threadCount),
    discovered: number(coverage.discovered),
    tokens: number(report.summary.totalTokens),
    hours: Math.max(0, Number(report.summary.totalDurationHours) || 0),
    activityDays,
    models: models.slice(0, 5).map(entry => ({ label: String(entry.label || '').slice(0, 60), count: number(entry.value) })),
  }
}

export function renderPublicProfile(profile) {
  const dates = new Map(profile.activityDays.map(day => [day.date, day.sessions]))
  const end = /^\d{4}-\d{2}-\d{2}$/.test(profile.dateRange.end) ? new Date(`${profile.dateRange.end}T00:00:00Z`) : new Date()
  const cells = []
  for (let offset = 83; offset >= 0; offset -= 1) {
    const day = new Date(end)
    day.setUTCDate(day.getUTCDate() - offset)
    const date = day.toISOString().slice(0, 10)
    const count = dates.get(date) || 0
    const level = count === 0 ? 0 : count === 1 ? 1 : count < 4 ? 2 : 3
    cells.push(`<span class="day level-${level}" title="${date}: ${count} completed sessions" aria-label="${date}: ${count} completed sessions"></span>`)
  }
  const modelRows = profile.models.filter(item => item.label && item.count).map((item, index) => `<li><span class="rank">0${index + 1}</span><span>${escapeHtml(item.label)}</span><strong>${compact(item.count)}</strong></li>`).join('')
  const range = [profile.dateRange.start, profile.dateRange.end].filter(Boolean).join(' to ')
  const scope = profile.scopeDays ? `Last ${profile.scopeDays} days` : 'All available local history'
  const coverage = profile.discovered > profile.sessions ? `${compact(profile.sessions)} analyzed of ${compact(profile.discovered)} discovered` : `${compact(profile.sessions)} analyzed sessions`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="description" content="A public Codex activity profile generated from local aggregate insights."><title>${escapeHtml(profile.name)} · Codex Insights</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#eceff3;background:#0b1015}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% -10%,#163044 0,transparent 34%),#0b1015}main{max-width:1020px;margin:0 auto;padding:42px 24px 70px}.top{display:flex;align-items:center;justify-content:space-between;gap:16px;color:#83a6b4;font-size:13px;letter-spacing:.15em;text-transform:uppercase}.brand{font-weight:800}.top-actions{display:flex;gap:10px;align-items:center}.pill,.share{border:1px solid #29414c;border-radius:99px;padding:8px 12px;letter-spacing:0;text-transform:none;background:transparent;color:inherit;font:inherit}.share{cursor:pointer;color:#c6f8e9}.share:hover{border-color:#55d6b4}.hero{padding:72px 0 54px;border-bottom:1px solid #26343a}.eyebrow{color:#55d6b4;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.17em}.hero h1{font-size:clamp(44px,8vw,82px);letter-spacing:-.065em;line-height:1;margin:14px 0}.handle{color:#9caeb8;font-size:20px}.intro{max-width:630px;color:#a5b6bf;line-height:1.6;margin:25px 0 0}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:30px 0}.stat,.panel{background:#121b21;border:1px solid #26343a;border-radius:18px}.stat{padding:24px}.stat strong{display:block;font-size:clamp(26px,4vw,42px);letter-spacing:-.06em}.stat span{display:block;color:#91a5ae;font-size:13px;margin-top:7px}.section-head{display:flex;align-items:end;justify-content:space-between;gap:14px;margin:50px 0 17px}.section-head h2{font-size:19px;margin:0}.section-head span{color:#8da3ad;font-size:13px}.panel{padding:24px}.activity{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-auto-flow:column;grid-template-rows:repeat(7,1fr);gap:8px}.day{aspect-ratio:1;border-radius:5px;min-width:0;background:#233039}.level-1{background:#1d6f6c}.level-2{background:#2db59d}.level-3{background:#8becbb}.legend{color:#869ba4;font-size:12px;margin-top:16px}.models{list-style:none;padding:0;margin:0}.models li{display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;padding:15px 0;border-bottom:1px solid #26343a}.models li:last-child{border:0}.rank{color:#46caa9;font-size:13px}.models strong{font-variant-numeric:tabular-nums}.foot{border-top:1px solid #26343a;margin-top:56px;padding-top:24px;color:#8195a0;font-size:12px;line-height:1.6}a{color:#75d8bf}@media(max-width:650px){main{padding:25px 16px 44px}.hero{padding:55px 0 35px}.stats{grid-template-columns:repeat(2,1fr)}.stat{padding:18px}.activity{gap:4px}.day{border-radius:2px}.panel{padding:16px}}
</style></head><body><main><header class="top"><span class="brand">◈ Codex Insights</span><span class="top-actions"><span class="pill">Public profile</span><button class="share" type="button" id="share-link">Copy link</button></span></header>
<section class="hero"><span class="eyebrow">Local activity, shared by choice</span><h1>${escapeHtml(profile.name)}</h1>${profile.handle ? `<div class="handle">@${escapeHtml(profile.handle)}</div>` : ''}<p class="intro">A snapshot of Codex sessions on one machine. Numbers reflect the report's selected scope and coverage, not account-wide usage or billing.</p></section>
<section class="stats" aria-label="Profile statistics"><div class="stat"><strong>${compact(profile.tokens)}</strong><span>Tokens in analyzed sessions</span></div><div class="stat"><strong>${compact(profile.sessions)}</strong><span>Analyzed sessions</span></div><div class="stat"><strong>${compact(profile.activityDays.length)}</strong><span>Active days in report</span></div><div class="stat"><strong>${compact(profile.hours)}h</strong><span>Session duration total</span></div></section>
<div class="section-head"><h2>Activity</h2><span>Sessions by completion date · last 12 weeks in scope</span></div><section class="panel"><div class="activity" role="img" aria-label="Activity calendar of completed sessions">${cells.join('')}</div><div class="legend">Darker squares show fewer sessions. Dates before the report scope are blank.</div></section>
<div class="section-head"><h2>Models used</h2><span>By analyzed session</span></div><section class="panel">${modelRows ? `<ol class="models">${modelRows}</ol>` : '<p>No model data in this report.</p>'}</section>
<footer class="foot">${escapeHtml(scope)}${range ? ` · ${escapeHtml(range)}` : ''} · ${escapeHtml(coverage)}<br>Generated ${escapeHtml(profile.generatedAt || 'from a local report')}. This page contains aggregate data only and does not update automatically. Built with <a href="https://github.com/mangeshraut712/codex-insights">Codex Insights</a>.</footer></main><script>document.getElementById('share-link').addEventListener('click',async event=>{try{await navigator.clipboard.writeText(location.href);event.currentTarget.textContent='Copied'}catch{event.currentTarget.textContent='Copy URL from address bar'}})</script></body></html>`
}

export async function writePublicProfile(report, options = {}) {
  const profile = buildPublicProfile(report, options)
  const outDir = path.resolve(options.outDir)
  await fs.mkdir(outDir, { recursive: true })
  const htmlPath = path.join(outDir, 'index.html')
  await fs.writeFile(htmlPath, renderPublicProfile(profile), { encoding: 'utf8', mode: 0o600 })
  return { htmlPath, profile }
}
