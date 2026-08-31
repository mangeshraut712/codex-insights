export function selectRepresentativeThreads(threads, limit) {
  const max = Math.max(0, Math.floor(Number(limit) || 0))
  if (!max) return []

  const strataByProject = new Map()
  for (const thread of threads) {
    const project = normalizeProject(thread.cwd)
    const week = calendarWeek(thread.updatedAt)
    if (!strataByProject.has(project)) strataByProject.set(project, new Map())
    const weeks = strataByProject.get(project)
    if (!weeks.has(week)) weeks.set(week, [])
    weeks.get(week).push(thread)
  }

  const projects = [...strataByProject.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, weeks]) =>
      [...weeks.entries()]
        .sort(([left], [right]) => right.localeCompare(left))
        .map(([, strata]) => sortThreads(strata)),
    )
  const selected = []
  let cycle = 0

  while (selected.length < max) {
    let added = false
    for (let projectIndex = 0; projectIndex < projects.length && selected.length < max; projectIndex += 1) {
      const strata = projects[projectIndex]
      if (!strata.length) continue
      const stratum = strata[(cycle + projectIndex) % strata.length]
      const itemIndex = Math.floor(cycle / strata.length)
      if (!stratum[itemIndex]) continue
      selected.push(stratum[itemIndex])
      added = true
    }
    if (!added) break
    cycle += 1
  }

  return selected
}

function normalizeProject(value) {
  const path = String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
  return path || '(unknown project)'
}

function calendarWeek(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'unknown-week'

  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function sortThreads(threads) {
  return [...threads].sort((left, right) => {
    const dateDifference = Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    if (Number.isFinite(dateDifference) && dateDifference !== 0) return dateDifference
    return String(left.id ?? '').localeCompare(String(right.id ?? ''))
  })
}
