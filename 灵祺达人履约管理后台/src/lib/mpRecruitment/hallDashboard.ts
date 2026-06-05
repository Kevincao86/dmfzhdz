import { normalizeHallPlatform } from './hallFilters'
import type { MpRegistry, RecruitmentOrderRow } from './types'
import { loadAllOrderRows } from './orderCard'
import type { MpWorkIdentity } from '../mpWorkIdentity'
import { orderVisibleToWorkIdentity } from './roleHallFilters'

export type HallDashboardStats = {
  total: number
  recruiting: number
  collecting: number
  urgent: number
  ice: number
  todayNew: number
  platformCounts: { platform: string; count: number }[]
  statusCounts: { label: string; count: number }[]
  categoryCounts: { category: string; count: number }[]
}

const PLATFORMS = ['抖音', '小红书', '大众点评', '快手', '微信视频号']

function isToday(ms: number) {
  if (!ms) return false
  const d = new Date(ms)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function countBy<T>(list: T[], keyFn: (item: T) => string, limit = 8) {
  const map = new Map<string, number>()
  for (const item of list) {
    const k = keyFn(item) || '其他'
    map.set(k, (map.get(k) || 0) + 1)
  }
  return [...map.entries()]
    .map(([k, count]) => ({ platform: k, category: k, label: k, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export function buildHallDashboardStats(reg: MpRegistry, identity: MpWorkIdentity): HallDashboardStats {
  const all = loadAllOrderRows(reg)
  const rows = identity === 'pr' ? all : all.filter((r) => orderVisibleToWorkIdentity(r, identity))
  const recruiting = rows.filter((r) => r.statusLabel === '招募中').length
  const collecting = rows.filter((r) => r.statusLabel === '收集中').length
  const urgent = rows.filter((r) => r.urgent && !r.isIce).length
  const ice = rows.filter((r) => r.isIce).length
  const todayNew = rows.filter((r) => isToday(r.publishedAtMs || 0)).length

  const platformMap = new Map<string, number>()
  for (const p of PLATFORMS) platformMap.set(p, 0)
  for (const r of rows) {
    const p = normalizeHallPlatform(r.platform)
    platformMap.set(p, (platformMap.get(p) || 0) + 1)
  }
  const platformCounts = [...platformMap.entries()]
    .map(([platform, count]) => ({ platform, count }))
    .sort((a, b) => b.count - a.count)

  const statusCounts = countBy(rows, (r) => r.statusLabel || '其他').map((x) => ({
    label: x.label,
    count: x.count,
  }))
  const categoryCounts = countBy(rows, (r: RecruitmentOrderRow) => r.category || '本地生活').map((x) => ({
    category: x.category,
    count: x.count,
  }))

  return {
    total: rows.length,
    recruiting,
    collecting,
    urgent,
    ice,
    todayNew,
    platformCounts,
    statusCounts,
    categoryCounts,
  }
}
