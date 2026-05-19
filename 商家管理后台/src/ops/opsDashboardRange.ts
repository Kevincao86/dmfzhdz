export type DashboardPreset = 'today' | '7d' | '30d' | 'custom'

export type DashboardRange = {
  preset: DashboardPreset
  start: Date
  end: Date
  label: string
}

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export function buildDashboardRange(
  preset: DashboardPreset,
  customStart?: string,
  customEnd?: string,
): DashboardRange {
  const now = new Date()
  if (preset === 'today') {
    return {
      preset,
      start: startOfDay(now),
      end: endOfDay(now),
      label: '今日',
    }
  }
  if (preset === '7d') {
    const start = startOfDay(now)
    start.setDate(start.getDate() - 6)
    return {
      preset,
      start,
      end: endOfDay(now),
      label: '近 7 日',
    }
  }
  if (preset === '30d') {
    const start = startOfDay(now)
    start.setDate(start.getDate() - 29)
    return {
      preset,
      start,
      end: endOfDay(now),
      label: '近 30 日',
    }
  }
  const s = customStart ? startOfDay(new Date(`${customStart}T00:00:00`)) : startOfDay(now)
  const e = customEnd ? endOfDay(new Date(`${customEnd}T00:00:00`)) : endOfDay(now)
  const safeStart = s.getTime() <= e.getTime() ? s : e
  const safeEnd = s.getTime() <= e.getTime() ? e : s
  return {
    preset: 'custom',
    start: safeStart,
    end: safeEnd,
    label: '自定义',
  }
}

export function formatRangeCaption(range: DashboardRange): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
  return `${fmt(range.start)} — ${fmt(range.end)}`
}

export function timestampInRange(iso: string, range: DashboardRange): boolean {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return false
  return t >= range.start.getTime() && t <= range.end.getTime()
}
