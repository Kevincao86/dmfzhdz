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

export type LeadsFunnelMetrics = {
  statCost: number
  clueCount: number
  convertCnt: number
  clickCnt: number
  leadCpl: number | null
  /** 线索数 / 平台转化数 */
  cluePerConvertPct: number | null
  /** 平台转化数 / 点击数 */
  platformConvertPct: number | null
}

export function buildLeadsFunnelMetrics(input: {
  promotions: LocalPromotionRow[]
  clues: LocalClueRow[]
  summary?: LocalReportSummary | null
}): LeadsFunnelMetrics {
  const promMetrics = sumPromotionMetrics(input.promotions)
  const statCost =
    input.summary?.statCost != null && input.summary.statCost > 0
      ? input.summary.statCost
      : promMetrics.statCost
  const convertCnt =
    input.summary?.convertCnt != null && input.summary.convertCnt > 0
      ? input.summary.convertCnt
      : promMetrics.convertCnt
  const clickCnt =
    input.summary?.clickCnt != null && input.summary.clickCnt > 0
      ? input.summary.clickCnt
      : promMetrics.clickCnt
  const clueCount = input.clues.length
  const leadCpl = clueCount > 0 ? Math.round((statCost / clueCount) * 100) / 100 : null
  const cluePerConvertPct =
    convertCnt > 0 ? Math.round((clueCount / convertCnt) * 10000) / 100 : null
  const platformConvertPct =
    clickCnt > 0 ? Math.round((convertCnt / clickCnt) * 10000) / 100 : null
  return {
    statCost,
    clueCount,
    convertCnt,
    clickCnt,
    leadCpl,
    cluePerConvertPct,
    platformConvertPct,
  }
}

export function clueStatsByPromotionWithSpend(
  clues: LocalClueRow[],
  promotions: LocalPromotionRow[],
) {
  const promoByName = new Map<string, LocalPromotionRow>()
  for (const p of promotions) {
    if (p.promotionName) promoByName.set(p.promotionName, p)
  }
  return clueStatsByPromotion(clues).map((row) => {
    const promo = promoByName.get(row.promotionName)
    const statCost = promo?.statCost ?? 0
    const convertCnt = promo?.convertCnt ?? 0
    const leadCpl = row.total > 0 ? Math.round((statCost / row.total) * 100) / 100 : null
    const conversionRate =
      convertCnt > 0 ? Math.round((row.total / convertCnt) * 10000) / 100 : null
    return { ...row, statCost, convertCnt, leadCpl, conversionRate }
  })
}
