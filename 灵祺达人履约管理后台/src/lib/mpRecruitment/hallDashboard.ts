import { normalizeHallPlatform } from './hallFilters'
import type { MpRegistry, RecruitmentOrderRow } from './types'
import { loadAllOrderRows } from './orderCard'
import type { MpWorkIdentity } from '../mpWorkIdentity'
import { orderVisibleToWorkIdentity } from './roleHallFilters'

export type HallDashboardStats = {
  total: number
  recruiting: number
  collecting: number
  ended: number
  urgent: number
  ice: number
  todayNew: number
  yesterdayNew: number
  platformCounts: { platform: string; count: number }[]
  statusCounts: { label: string; count: number }[]
  categoryCounts: { category: string; count: number }[]
  /** 近 7 天每日新增撮合单 */
  dailyTrend: { label: string; count: number }[]
  /** 平台动态卡片（PR 首页底部） */
  dynamicCards: { label: string; count: number; delta: number; tone: 'blue' | 'green' | 'orange' | 'purple' }[]
}

const PLATFORMS = ['抖音', '小红书', '大众点评', '快手', '微信视频号']

function dayKey(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isToday(ms: number) {
  if (!ms) return false
  return dayKey(ms) === dayKey(Date.now())
}

function isYesterday(ms: number) {
  if (!ms) return false
  const y = new Date()
  y.setDate(y.getDate() - 1)
  return dayKey(ms) === dayKey(y.getTime())
}

function buildDailyTrend(rows: RecruitmentOrderRow[]) {
  const days: { label: string; count: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = dayKey(d.getTime())
    const label = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const count = rows.filter((r) => dayKey(r.publishedAtMs || 0) === key).length
    days.push({ label, count })
  }
  return days
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
  const yesterdayNew = rows.filter((r) => isYesterday(r.publishedAtMs || 0)).length
  const ended = rows.filter((r) => {
    const s = String(r.statusLabel || '')
    return s === '已结束' || s === '已停止' || s === '已截止' || s === '已删除'
  }).length

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

  const pendingApplicants = rows
    .filter((r) => r.statusLabel === '招募中')
    .reduce((s, r) => s + (Number(r.applicantCount) || 0), 0)
  const toConfirm = rows.filter((r) => r.statusLabel === '收集中').length
  const abnormal = rows.filter((r) => {
    const s = String(r.statusLabel || '')
    return s === '已截止' || s === '已停止' || Boolean(r.urgent)
  }).length
  const toCommunicate = rows.filter((r) => (Number(r.applicantCount) || 0) > 0 && r.statusLabel === '招募中').length

  const dynamicCards = [
    { label: '待处理报名', count: pendingApplicants, delta: 0, tone: 'blue' as const },
    { label: '待沟通', count: toCommunicate, delta: 0, tone: 'green' as const },
    { label: '待确认合作', count: toConfirm, delta: 0, tone: 'orange' as const },
    { label: '异常单据', count: abnormal, delta: 0, tone: 'purple' as const },
  ]

  return {
    total: rows.length,
    recruiting,
    collecting,
    ended,
    urgent,
    ice,
    todayNew,
    yesterdayNew,
    platformCounts,
    statusCounts,
    categoryCounts,
    dailyTrend: buildDailyTrend(rows),
    dynamicCards,
  }
}

export function emptyHallDashboardStats(): HallDashboardStats {
  return {
    total: 0,
    recruiting: 0,
    collecting: 0,
    ended: 0,
    urgent: 0,
    ice: 0,
    todayNew: 0,
    yesterdayNew: 0,
    platformCounts: PLATFORMS.map((platform) => ({ platform, count: 0 })),
    statusCounts: [],
    categoryCounts: [],
    dailyTrend: buildDailyTrend([]),
    dynamicCards: [
      { label: '待处理报名', count: 0, delta: 0, tone: 'blue' },
      { label: '待沟通', count: 0, delta: 0, tone: 'green' },
      { label: '待确认合作', count: 0, delta: 0, tone: 'orange' },
      { label: '异常单据', count: 0, delta: 0, tone: 'purple' },
    ],
  }
}
