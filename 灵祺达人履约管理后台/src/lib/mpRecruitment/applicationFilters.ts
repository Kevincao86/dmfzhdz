export const APPLICATION_TIME_FILTERS = [
  { id: 'all', label: '全部时间' },
  { id: '7d', label: '近7天' },
  { id: '30d', label: '近30天' },
  { id: 'older', label: '更早' },
] as const

export type ApplicationTimeFilterId = (typeof APPLICATION_TIME_FILTERS)[number]['id']

export function parseAppliedAtMs(appliedAt?: string): number {
  if (!appliedAt) return 0
  const normalized = appliedAt.replace(/\//g, '-')
  const t = Date.parse(normalized)
  return Number.isFinite(t) ? t : 0
}

export function matchApplicationTimeFilter(appliedAtMs: number, filter: ApplicationTimeFilterId): boolean {
  if (filter === 'all') return true
  const ms = appliedAtMs || 0
  if (!ms) return false
  const now = Date.now()
  if (filter === '7d') return ms >= now - 7 * 86400000
  if (filter === '30d') return ms >= now - 30 * 86400000
  return ms < now - 30 * 86400000
}
