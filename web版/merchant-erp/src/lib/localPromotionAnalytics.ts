import type { LocalClueRow, LocalProjectRow, LocalPromotionRow, LocalReportSummary } from './localPromotionTypes'

export type LocalPromotionChannel = 'live' | 'video' | 'other'

export type LocalPromotionChannelStats = {
  channel: LocalPromotionChannel
  label: string
  promotionCount: number
  activeCount: number
  statCost: number
  showCnt: number
  clickCnt: number
  convertCnt: number
  ctr: number
  clueCount: number
  newClueCount: number
}

const LIVE_GOALS = new Set(['LIVE', 'LIVE_PROMOTION', 'LIVE_ROOM', 'LIVE_STREAM'])
const VIDEO_GOALS = new Set([
  'VIDEO_IMAGE',
  'VIDEO',
  'SHORT_VIDEO',
  'IMAGE',
  'PRODUCT',
  'POI',
  'EXTERNAL',
])

export function normalizeMarketingGoal(raw?: string): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '_')
}

export function classifyMarketingGoal(raw?: string): LocalPromotionChannel {
  const g = normalizeMarketingGoal(raw)
  if (!g) return 'video'
  if (LIVE_GOALS.has(g) || g.includes('LIVE')) return 'live'
  if (VIDEO_GOALS.has(g) || g.includes('VIDEO') || g.includes('IMAGE')) return 'video'
  return 'other'
}

export function marketingGoalLabel(raw?: string): string {
  const ch = classifyMarketingGoal(raw)
  if (ch === 'live') return '直播间'
  if (ch === 'video') return '短视频'
  return '其他投放'
}

export function filterPromotionsByChannel(
  rows: LocalPromotionRow[],
  channel: LocalPromotionChannel,
): LocalPromotionRow[] {
  return rows.filter((r) => classifyMarketingGoal(r.marketingGoal) === channel)
}

export function filterProjectsByChannel(
  rows: LocalProjectRow[],
  channel: LocalPromotionChannel,
): LocalProjectRow[] {
  return rows.filter((r) => classifyMarketingGoal(r.marketingGoal) === channel)
}

function sumPromotionMetrics(rows: LocalPromotionRow[]) {
  let statCost = 0
  let showCnt = 0
  let clickCnt = 0
  let convertCnt = 0
  for (const r of rows) {
    statCost += Number(r.statCost ?? 0)
    showCnt += Number(r.showCnt ?? 0)
    clickCnt += Number(r.clickCnt ?? 0)
    convertCnt += Number(r.convertCnt ?? 0)
  }
  const ctr = showCnt > 0 ? Math.round((clickCnt / showCnt) * 10000) / 100 : 0
  return { statCost, showCnt, clickCnt, convertCnt, ctr }
}

export function buildChannelStats(input: {
  promotions: LocalPromotionRow[]
  clues: LocalClueRow[]
}): LocalPromotionChannelStats[] {
  const channels: Array<{ channel: LocalPromotionChannel; label: string }> = [
    { channel: 'live', label: '直播间投流' },
    { channel: 'video', label: '短视频投流' },
    { channel: 'other', label: '其他投放' },
  ]
  return channels.map(({ channel, label }) => {
    const promos = filterPromotionsByChannel(input.promotions, channel)
    const metrics = sumPromotionMetrics(promos)
    const promoNames = new Set(promos.map((p) => p.promotionName).filter(Boolean))
    const clues = input.clues.filter(
      (c) => !c.promotionName || promoNames.size === 0 || promoNames.has(c.promotionName ?? ''),
    )
    const channelClues =
      channel === 'other'
        ? input.clues.filter((c) => {
            const matched = input.promotions.find((p) => p.promotionName === c.promotionName)
            return !matched || classifyMarketingGoal(matched.marketingGoal) === 'other'
          })
        : clues
    return {
      channel,
      label,
      promotionCount: promos.length,
      activeCount: promos.filter((p) => p.statusFirst === 'PROMOTION_STATUS_ENABLE').length,
      clueCount: channelClues.length,
      newClueCount: channelClues.filter((c) => c.convertState === 'NEW' || !c.callbackDone).length,
      ...metrics,
    }
  })
}

export function clueStatsByPromotion(clues: LocalClueRow[]) {
  const map = new Map<string, { total: number; newCount: number }>()
  for (const c of clues) {
    const key = c.promotionName?.trim() || '未关联广告'
    const cur = map.get(key) ?? { total: 0, newCount: 0 }
    cur.total += 1
    if (c.convertState === 'NEW' || !c.callbackDone) cur.newCount += 1
    map.set(key, cur)
  }
  return [...map.entries()]
    .map(([promotionName, v]) => ({ promotionName, ...v }))
    .sort((a, b) => b.total - a.total)
}

export function formatReportRange(summary: LocalReportSummary | null): string {
  if (!summary?.dateRange) return '近7日'
  const { start, end } = summary.dateRange
  if (!start || !end) return '近7日'
  return `${start.slice(0, 10)} ~ ${end.slice(0, 10)}`
}
