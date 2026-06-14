import {
  CATEGORY_FILTERS,
  buildCityFilterOptions,
  matchCategory,
  matchPlatform,
  matchRegionFilter,
} from './hallFilters'

export const APPLICATION_TIME_FILTERS = [
  { id: 'all', label: '全部时间' },
  { id: '7d', label: '近7天' },
  { id: '30d', label: '近30天' },
  { id: 'older', label: '更早' },
] as const

export type ApplicationTimeFilterId = (typeof APPLICATION_TIME_FILTERS)[number]['id']

export function parseAppliedAtMs(appliedAt?: string): number {
  if (!appliedAt) return 0
  const t = Date.parse(String(appliedAt).replace(/\//g, '-'))
  return Number.isFinite(t) ? t : 0
}

export function matchApplicationTimeFilter(appliedAtMs: number, filter: ApplicationTimeFilterId): boolean {
  if (!filter || filter === 'all') return true
  const ms = appliedAtMs || 0
  if (!ms) return false
  const now = Date.now()
  if (filter === '7d') return ms >= now - 7 * 86400000
  if (filter === '30d') return ms >= now - 30 * 86400000
  return ms < now - 30 * 86400000
}

export type ApplicationFilterOpts = {
  timeFilter?: ApplicationTimeFilterId
  platform?: string
  category?: string
  province?: string
  city?: string
  keyword?: string
}

export function filterApplicationRows<T extends { appliedAt?: string; platform?: string; category?: string; region?: string }>(
  rows: T[],
  opts: ApplicationFilterOpts,
): T[] {
  const timeFilter = opts.timeFilter || 'all'
  const platform = opts.platform || '全部'
  const category = opts.category || '全部'
  const province = opts.province || '全部'
  const city = opts.city || '全部'
  const keyword = String(opts.keyword || '').trim().toLowerCase()

  return (rows || []).filter((r) => {
    if (!matchApplicationTimeFilter(parseAppliedAtMs(r.appliedAt), timeFilter)) return false
    if (!matchPlatform(String(r.platform || ''), platform)) return false
    if (!matchCategory(String(r.category || ''), category)) return false
    if (!matchRegionFilter(String(r.region || ''), '', province, city)) return false
    if (keyword) {
      const blob = [r.appliedAt, r.platform, r.category, r.region, (r as { title?: string }).title, (r as { mpOrderId?: string }).mpOrderId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!blob.includes(keyword)) return false
    }
    return true
  })
}

export { CATEGORY_FILTERS, buildCityFilterOptions }
