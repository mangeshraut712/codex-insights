import path from 'node:path'
import { promises as fs } from 'node:fs'

const number = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const compact = value => compactFormat.format(number(value))
const hoursLabel = value => compactFormat.format(Math.max(0, Number(value) || 0))
const grouped = value => new Intl.NumberFormat('en-US').format(number(value))
const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const share = (part, whole) => whole ? `${Math.round((part / whole) * 100)}%` : '0%'
const days = value => `${grouped(value)} ${number(value) === 1 ? 'day' : 'days'}`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const HEATMAP_WEEKS = 52

/**
 * @typedef {{ date: string, value: number }} SeriesPoint
 * @typedef {{ label: string, value: string, prefix?: string }} ProfileRow
 * @typedef {{
 *   source: 'account' | 'local',
 *   name: string,
 *   handle: string,
 *   intro: string,
 *   generatedAt: string,
 *   stats: ProfileRow[],
 *   activity: { title: string, unit: string, daily: SeriesPoint[], weekly: SeriesPoint[], cumulative: SeriesPoint[] },
 *   panels: { title: string, rows: ProfileRow[], empty: string }[],
 *   footer: string,
 * }} PublicProfile
 */

function cleanIdentity(options, fallbackName = '', fallbackHandle = '') {
  return {
    name: String(options.name || fallbackName || 'Codex user').trim().slice(0, 80),
    handle: String(options.handle || fallbackHandle || '').trim().replace(/^@/, '').slice(0, 40),
  }
}

export function durationLabel(seconds) {
  const total = number(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours) return minutes ? `${hours}h ${minutes}m` : `${hours}h`
  if (minutes) return `${minutes}m`
  return `${total}s`
}

function weekStart(date) {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - day.getUTCDay())
  return day.toISOString().slice(0, 10)
}

/** @param {SeriesPoint[]} daily */
function deriveSeries(daily) {
  const weeklyTotals = new Map()
  for (const point of daily) weeklyTotals.set(weekStart(point.date), (weeklyTotals.get(weekStart(point.date)) || 0) + point.value)
  let running = 0
  return {
    weekly: [...weeklyTotals].map(([date, value]) => ({ date, value })),
    cumulative: daily.map(point => ({ date: point.date, value: (running += point.value) })),
  }
}

/** @returns {PublicProfile} */
export function buildAccountProfile(account, options = {}) {
  if (!account || !account.summary) throw new Error('Account profile data is required.')
  const { name, handle } = cleanIdentity(options, account.displayName, account.username)
  const daily = account.daily.map(point => ({ date: point.date, value: number(point.tokens) }))
  const activity = account.activity
  const reasoning = activity?.reasoningEffort
    ? `${activity.reasoningEffort.charAt(0).toUpperCase()}${activity.reasoningEffort.slice(1)}${activity.reasoningEffortPercent == null ? '' : ` · ${Math.round(activity.reasoningEffortPercent)}%`}`
    : 'None'
  return {
    source: 'account',
    name,
    handle,
    intro: 'Account-wide Codex activity, shared by choice.',
    generatedAt: new Date().toISOString(),
    stats: [
      { label: 'Lifetime tokens', value: compact(account.summary.lifetimeTokens) },
      { label: 'Peak tokens', value: compact(account.summary.peakDailyTokens) },
      { label: 'Longest chat', value: durationLabel(account.summary.longestRunningTurnSec) },
      { label: 'Current streak', value: days(account.summary.currentStreakDays) },
      { label: 'Longest streak', value: days(account.summary.longestStreakDays) },
    ],
    activity: { title: 'Token activity', unit: 'tokens', daily, ...deriveSeries(daily) },
    panels: [
      {
        title: 'Activity insights',
        empty: 'Activity insights were not available when this page was generated.',
        rows: activity
          ? [
              { label: 'Fast Mode', value: activity.fastModePercent == null ? 'Not used' : `${Math.round(activity.fastModePercent)}%` },
              { label: 'Most used reasoning', value: reasoning },
              { label: 'Skills explored', value: grouped(activity.skillsExplored) },
              { label: 'Total skills used', value: grouped(activity.totalSkillsUsed) },
              { label: 'Total chats', value: grouped(activity.totalThreads) },
            ]
          : [],
      },
      {
        title: 'Most used plugins',
        empty: 'No skill or plugin runs yet.',
        rows: account.invocations.map(item => ({
          label: item.name,
          prefix: item.type === 'plugin' ? '@' : '$',
          value: `${grouped(item.count)} ${item.count === 1 ? 'run' : 'runs'}`,
        })),
      },
    ],
    footer: `Codex account stats${account.statsAsOf ? ` as of ${account.statsAsOf}` : ''}, across all devices. Aggregates only; this snapshot does not update automatically.`,
  }
}

/** @returns {PublicProfile} */
export function buildPublicProfile(report, options = {}) {
  if (!report || !report.metadata || !report.summary) throw new Error('A valid report.json is required.')
  const { name, handle } = cleanIdentity(options)
  const coverage = report.metadata.coverage || {}
  const daily = (Array.isArray(report.charts?.activityDays) ? report.charts.activityDays : [])
    .filter(day => isDate(day?.date) && number(day.sessions) > 0)
    .map(day => ({ date: day.date, value: number(day.sessions) }))
    .slice(-366)
  const sessions = number(coverage.analyzed ?? report.metadata.threadCount)
  const discovered = number(coverage.discovered)
  const summary = report.summary
  const tokenMix = number(summary.totalInputTokens)
    ? [
        { label: 'Input tokens', value: compact(summary.totalInputTokens) },
        { label: 'Served from cache', value: share(number(summary.totalCachedInputTokens), number(summary.totalInputTokens)) },
        { label: 'Output tokens', value: compact(summary.totalOutputTokens) },
        { label: 'Reasoning share of output', value: share(number(summary.totalReasoningOutputTokens), number(summary.totalOutputTokens)) },
      ]
    : []
  const models = (Array.isArray(report.charts?.models) ? report.charts.models : [])
    .slice(0, 5)
    .map(entry => ({ label: String(entry.label || '').slice(0, 60), value: compact(entry.value) }))
    .filter(row => row.label && row.value !== '0')
  const since = isDate(report.metadata.since) ? report.metadata.since : ''
  const scopeDays = report.metadata.days === null ? 0 : number(report.metadata.days)
  const scope = since ? `Since ${since}` : scopeDays ? `Last ${scopeDays} days` : 'All available local history'
  const range = [report.metadata.dateRange?.start, report.metadata.dateRange?.end].filter(Boolean).join(' to ')
  const coverageText = discovered > sessions ? `${compact(sessions)} analyzed of ${compact(discovered)} discovered` : `${compact(sessions)} analyzed sessions`
  return {
    source: 'local',
    name,
    handle,
    intro: "A snapshot of Codex sessions on one machine. Numbers reflect the report's scope and coverage, not account-wide usage.",
    generatedAt: String(report.metadata.generatedAt || ''),
    stats: [
      { label: 'Tokens in analyzed sessions', value: compact(summary.totalTokens) },
      { label: 'Analyzed sessions', value: compact(sessions) },
      { label: 'Active days in report', value: compact(daily.length) },
      { label: 'Session duration total', value: `${hoursLabel(summary.totalDurationHours)}h` },
    ],
    activity: { title: 'Session activity', unit: 'sessions', daily, ...deriveSeries(daily) },
    panels: [
      ...(tokenMix.length ? [{ title: 'Token mix', rows: tokenMix, empty: '' }] : []),
      { title: 'Models used', rows: models, empty: 'No model data in this report.' },
    ],
    footer: `${scope}${range ? ` · ${range}` : ''} · ${coverageText}. Aggregates from one machine; this snapshot does not update automatically.`,
  }
}

function initials(name) {
  const parts = name.split(/\s+/).filter(Boolean)
  return `${parts[0]?.charAt(0) ?? ''}${parts.length > 1 ? parts.at(-1).charAt(0) : ''}`.toUpperCase() || '?'
}

/** @param {SeriesPoint[]} daily */
function renderHeatmap(daily, unit) {
  const values = new Map(daily.map(point => [point.date, point.value]))
  const last = daily.at(-1)?.date ?? new Date().toISOString().slice(0, 10)
  const start = new Date(`${weekStart(last)}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - (HEATMAP_WEEKS - 1) * 7)
  const sorted = daily.map(point => point.value).filter(Boolean).sort((a, b) => a - b)
  const quantile = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
  const thresholds = [quantile(0.25), quantile(0.5), quantile(0.75)]
  const cells = []
  const months = []
  let lastMonth = -1
  for (let week = 0; week < HEATMAP_WEEKS; week += 1) {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const day = new Date(start)
      day.setUTCDate(start.getUTCDate() + week * 7 + weekday)
      const date = day.toISOString().slice(0, 10)
      if (weekday === 0 && day.getUTCMonth() !== lastMonth) {
        lastMonth = day.getUTCMonth()
        if (months.length && week - months.at(-1).week < 3) months.pop()
        months.push({ week, label: MONTHS[lastMonth] })
      }
      if (date > last) {
        cells.push('<span class="cell future"></span>')
        continue
      }
      const value = values.get(date) || 0
      const level = value === 0 ? 0 : value <= thresholds[0] ? 1 : value <= thresholds[1] ? 2 : value <= thresholds[2] ? 3 : 4
      const label = `${date}: ${grouped(value)} ${unit}`
      cells.push(`<span class="cell l${level}" title="${label}" aria-label="${label}"></span>`)
    }
  }
  return `<div class="heatmap" role="img" aria-label="Daily ${unit} over the last year">${cells.join('')}</div><div class="months">${months.map(month => `<span style="grid-column:${month.week + 1}">${month.label}</span>`).join('')}</div>`
}

/** @param {SeriesPoint[]} points */
function renderBars(points, unit) {
  if (!points.length) return '<p class="empty">No activity yet.</p>'
  const max = Math.max(...points.map(point => point.value), 1)
  const width = 100 / points.length
  const bars = points.map((point, index) => {
    const height = Math.max(1.5, (point.value / max) * 100)
    return `<rect x="${(index * width + width * 0.15).toFixed(3)}" y="${(100 - height).toFixed(3)}" width="${(width * 0.7).toFixed(3)}" height="${height.toFixed(3)}" rx="0.6"><title>Week of ${point.date}: ${grouped(point.value)} ${unit}</title></rect>`
  })
  return `<svg class="chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Weekly ${unit}">${bars.join('')}</svg><div class="axis"><span>${points[0].date}</span><span>${points.at(-1).date}</span></div>`
}

/** @param {SeriesPoint[]} points */
function renderArea(points, unit) {
  if (!points.length) return '<p class="empty">No activity yet.</p>'
  const max = Math.max(points.at(-1).value, 1)
  const step = points.length > 1 ? 100 / (points.length - 1) : 100
  const coords = points.map((point, index) => `${(index * step).toFixed(3)},${(100 - (point.value / max) * 96).toFixed(3)}`)
  return `<svg class="chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Cumulative ${unit}"><polygon class="area" points="0,100 ${coords.join(' ')} 100,100"/><polyline class="line" points="${coords.join(' ')}"/></svg><div class="axis"><span>${points[0].date}</span><span>${compact(points.at(-1).value)} ${unit}</span></div>`
}

function renderRows(rows) {
  return rows.map(row => `<li><span>${row.prefix ? `<b class="prefix">${escapeHtml(row.prefix)}</b>` : ''}${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></li>`).join('')
}

/** @param {PublicProfile} profile */
export function renderPublicProfile(profile) {
  const { activity } = profile
  const panels = profile.panels.map(panel => `<section class="panel"><h2>${escapeHtml(panel.title)}</h2>${panel.rows.length ? `<ul class="rows">${renderRows(panel.rows)}</ul>` : `<p class="empty">${escapeHtml(panel.empty)}</p>`}</section>`).join('')
  const stats = profile.stats.map(stat => `<div class="stat"><strong>${escapeHtml(stat.value)}</strong><span>${escapeHtml(stat.label)}</span></div>`).join('')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="description" content="${escapeHtml(profile.name)}'s Codex profile: aggregate activity generated with Codex Insights."><meta property="og:title" content="${escapeHtml(profile.name)} · Codex profile"><title>${escapeHtml(profile.name)} · Codex profile</title>
<style>
:root{--bg:#fff;--fg:#0d0d0d;--muted:#6b6b6b;--line:#e8e8e8;--card:#fff;--l0:#eef1f6;--l1:#d6e0f5;--l2:#a9bff0;--l3:#6f95e6;--l4:#2f63d6;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;color:var(--fg);background:var(--bg)}
@media(prefers-color-scheme:dark){:root{--bg:#141414;--fg:#f2f2f2;--muted:#9a9a9a;--line:#2b2b2b;--card:#1b1b1b;--l0:#232529;--l1:#23355c;--l2:#2f4f94;--l3:#4a74d1;--l4:#7aa2ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg)}main{max-width:760px;margin:0 auto;padding:28px 20px 64px}
.top{display:flex;justify-content:space-between;align-items:center;font-size:14px}.brand{font-weight:600}.brand a{color:inherit;text-decoration:none}.share{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:7px 14px;font:inherit;font-size:13px;cursor:pointer}
.hero{text-align:center;padding:48px 0 28px}.avatar{width:84px;height:84px;border-radius:50%;margin:0 auto 18px;display:grid;place-items:center;font-size:30px;font-weight:600;color:#fff;background:linear-gradient(135deg,#2f63d6,#8a5cf6)}.hero h1{font-size:30px;font-weight:600;margin:0}.handle{color:var(--muted);margin-top:6px;font-size:15px}.intro{color:var(--muted);font-size:13px;margin:10px 0 0}
.stats{display:grid;grid-template-columns:repeat(${profile.stats.length},1fr);border:1px solid var(--line);border-radius:14px;background:var(--card)}.stat{text-align:center;padding:16px 8px;border-left:1px solid var(--line)}.stat:first-child{border-left:0}.stat strong{display:block;font-size:17px;font-weight:600}.stat span{display:block;color:var(--muted);font-size:12.5px;margin-top:4px}
.activity{margin-top:34px}.activity-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}h2{font-size:15px;font-weight:600;margin:0}.tabs{display:flex;gap:14px}.tabs button{border:0;background:none;color:var(--muted);font:inherit;font-size:13px;cursor:pointer;padding:0}.tabs button[aria-selected=true]{color:var(--fg);font-weight:600}
.heatmap{display:grid;grid-template-columns:repeat(${HEATMAP_WEEKS},1fr);grid-template-rows:repeat(7,1fr);grid-auto-flow:column;gap:3px}.cell{aspect-ratio:1;border-radius:2px;background:var(--l0)}.cell.future{background:transparent}.l1{background:var(--l1)}.l2{background:var(--l2)}.l3{background:var(--l3)}.l4{background:var(--l4)}
.months{display:grid;grid-template-columns:repeat(${HEATMAP_WEEKS},1fr);color:var(--muted);font-size:11px;margin-top:6px;white-space:nowrap}
.chart{width:100%;height:140px;display:block}.chart rect{fill:var(--l3)}.area{fill:var(--l1)}.line{fill:none;stroke:var(--l4);stroke-width:.8;vector-effect:non-scaling-stroke}.axis{display:flex;justify-content:space-between;color:var(--muted);font-size:11px;margin-top:6px}
.panels{display:grid;grid-template-columns:repeat(2,1fr);gap:40px;margin-top:38px}.rows{list-style:none;padding:0;margin:12px 0 0}.rows li{display:flex;justify-content:space-between;gap:12px;padding:7px 0;font-size:13.5px}.rows li span{color:var(--muted)}.rows strong{font-weight:500;font-variant-numeric:tabular-nums}.prefix{color:var(--fg);font-weight:600;margin-right:1px}.empty{color:var(--muted);font-size:13px}
.foot{border-top:1px solid var(--line);margin-top:48px;padding-top:18px;color:var(--muted);font-size:12px;line-height:1.6}.foot a{color:inherit}
@media(max-width:640px){.stats{grid-template-columns:repeat(2,1fr)}.stat{border-left:0;border-top:1px solid var(--line)}.stat:nth-child(-n+2){border-top:0}.panels{grid-template-columns:1fr;gap:26px}.heatmap{gap:2px}.months{font-size:9px}}
</style></head><body><main>
<header class="top"><span class="brand"><a href="https://github.com/mangeshraut712/codex-insights">◈ Codex Insights</a></span><button class="share" type="button" id="share-link">Copy link</button></header>
<section class="hero"><div class="avatar" aria-hidden="true">${escapeHtml(initials(profile.name))}</div><h1>${escapeHtml(profile.name)}</h1>${profile.handle ? `<div class="handle">@${escapeHtml(profile.handle)}</div>` : ''}<p class="intro">${escapeHtml(profile.intro)}</p></section>
<section class="stats" aria-label="Profile statistics">${stats}</section>
<section class="activity"><div class="activity-head"><h2>${escapeHtml(activity.title)}</h2><div class="tabs" role="tablist"><button type="button" role="tab" aria-selected="true" data-view="daily">Daily</button><button type="button" role="tab" aria-selected="false" data-view="weekly">Weekly</button><button type="button" role="tab" aria-selected="false" data-view="cumulative">Cumulative</button></div></div>
<div data-panel="daily">${renderHeatmap(activity.daily, activity.unit)}</div><div data-panel="weekly" hidden>${renderBars(activity.weekly, activity.unit)}</div><div data-panel="cumulative" hidden>${renderArea(activity.cumulative, activity.unit)}</div></section>
<div class="panels">${panels}</div>
<footer class="foot">${escapeHtml(profile.footer)}${profile.generatedAt ? ` Generated ${escapeHtml(profile.generatedAt)}.` : ''} Built with <a href="https://github.com/mangeshraut712/codex-insights">Codex Insights</a>.</footer>
</main><script>
const shareButton=document.getElementById('share-link');shareButton.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);shareButton.textContent='Copied'}catch{shareButton.textContent='Copy URL from address bar'}});
const tabs=document.querySelectorAll('[data-view]');tabs.forEach(tab=>tab.addEventListener('click',()=>{tabs.forEach(other=>other.setAttribute('aria-selected',String(other===tab)));document.querySelectorAll('[data-panel]').forEach(panel=>{panel.hidden=panel.dataset.panel!==tab.dataset.view})}));
</script></body></html>`
}

/** @param {PublicProfile} profile */
export async function writeProfileSite(profile, options = {}) {
  const outDir = path.resolve(options.outDir)
  await fs.mkdir(outDir, { recursive: true })
  const htmlPath = path.join(outDir, 'index.html')
  const jsonPath = path.join(outDir, 'profile.json')
  await fs.writeFile(htmlPath, renderPublicProfile(profile), { encoding: 'utf8', mode: 0o600 })
  await fs.writeFile(jsonPath, `${JSON.stringify(profile, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return { htmlPath, jsonPath }
}
