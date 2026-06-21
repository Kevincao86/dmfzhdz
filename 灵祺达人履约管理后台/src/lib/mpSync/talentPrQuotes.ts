import type { TalentMember, TalentPrExclusiveQuote } from './talentPlatformProfiles'
import { platformIdFromName } from './talentPlatformProfiles'

const PLATFORM_ALIASES: Record<string, string> = {
  抖音: 'douyin',
  小红书: 'xiaohongshu',
  快手: 'kuaishou',
  大众点评: 'dianping',
  微信视频号: 'weixin_video',
}

export function normalizeQuotePlatform(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return 'douyin'
  return PLATFORM_ALIASES[s] || PLATFORM_ALIASES[s.toLowerCase()] || s.toLowerCase()
}

export function readMpPublishPrKeys(meta: Record<string, unknown> | null | undefined): {
  prLingqiId: string
  prRegistryId: string
} {
  const m = meta && typeof meta === 'object' ? meta : {}
  return {
    prLingqiId: String(m.lingqiPrId || '').trim(),
    prRegistryId: String(m.registryPrId || '').trim(),
  }
}

export function resolveExclusiveQuoteYuan(
  quotes: TalentPrExclusiveQuote[] | undefined,
  opts: { prLingqiId?: string; prRegistryId?: string; platform: string },
): number | null {
  const list = Array.isArray(quotes) ? quotes : []
  if (!list.length) return null
  const plat = normalizeQuotePlatform(opts.platform)
  const prLq = String(opts.prLingqiId || '').trim()
  const prReg = String(opts.prRegistryId || '').trim()
  for (const q of list) {
    if (normalizeQuotePlatform(q.platform) !== plat) continue
    if (prLq && String(q.prLingqiId || '').trim() === prLq) return q.quoteYuan
    if (prReg && String(q.prRegistryId || '').trim() === prReg) return q.quoteYuan
  }
  return null
}

/** 平台资料默认报价（不含专属价） */
export function resolveDefaultApplyQuotePrice(
  member: TalentMember | null | undefined,
  platform: string,
): string {
  const pid = platformIdFromName(platform)
  const prof = member?.platformProfiles?.[pid]
  return String(prof?.quotePrice || '').trim()
}

export function getExclusiveQuoteOffer(
  member: TalentMember | null | undefined,
  platform: string,
  orderMeta: Record<string, unknown> | null | undefined,
): { quoteYuan: number; prLabel: string } | null {
  const prKeys = readMpPublishPrKeys(orderMeta)
  const quoteYuan = resolveExclusiveQuoteYuan(member?.prExclusiveQuotes, {
    ...prKeys,
    platform,
  })
  if (quoteYuan == null || quoteYuan <= 0) return null
  const meta = orderMeta && typeof orderMeta === 'object' ? orderMeta : {}
  const prLabel = String(meta.prDisplayName || prKeys.prLingqiId || '该 PR').trim()
  return { quoteYuan, prLabel }
}

/** @deprecated 报名请先用默认价，再弹窗确认专属价 */
export function resolveApplyQuotePrice(
  member: TalentMember | null | undefined,
  platform: string,
  orderMeta: Record<string, unknown> | null | undefined,
): string {
  const exclusive = getExclusiveQuoteOffer(member, platform, orderMeta)
  if (exclusive) return String(exclusive.quoteYuan)
  return resolveDefaultApplyQuotePrice(member, platform)
}

export function formatCooperationStatsLabel(stats: {
  minYuan: number
  maxYuan: number
  avgYuan: number
  sampleCount: number
  windowDays?: number
} | null | undefined): string {
  if (!stats || stats.sampleCount <= 0) return ''
  const days = stats.windowDays ?? 30
  if (stats.sampleCount === 1) {
    return `近${days}天合作价 ¥${stats.avgYuan}（1 单）`
  }
  return `近${days}天 ¥${stats.minYuan}–¥${stats.maxYuan}（均 ¥${stats.avgYuan}，${stats.sampleCount} 单）`
}

export type CooperationPriceStats = {
  minYuan: number
  maxYuan: number
  avgYuan: number
  sampleCount: number
  windowDays: number
}
