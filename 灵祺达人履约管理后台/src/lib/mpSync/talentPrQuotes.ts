import type { TalentMember, TalentPrExclusiveQuote } from './talentPlatformProfiles'
import { platformIdFromName } from './talentPlatformProfiles'
import { orderMetaHasAnyTierSelfQuote } from './mpRecruitmentTierQuote'

const PLATFORM_ALIASES: Record<string, string> = {
  抖音: 'douyin',
  小红书: 'xiaohongshu',
  快手: 'kuaishou',
  大众点评: 'dianping',
  微信视频号: 'weixin_video',
  半天: 'half_day',
  全天: 'full_day',
  单条剪辑: 'per_clip',
  单条: 'per_clip',
  half_day: 'half_day',
  full_day: 'full_day',
  per_clip: 'per_clip',
}

export const SHOOT_QUOTE_OPTIONS = [
  { name: '半天', key: 'half_day' },
  { name: '全天', key: 'full_day' },
] as const

export const EDIT_QUOTE_OPTIONS = [
  { name: '单条剪辑', key: 'per_clip' },
  { name: '半天', key: 'half_day' },
  { name: '全天', key: 'full_day' },
] as const

export type SupplierWorkId = 'shoot' | 'edit'

export function quoteOptionsForWorkIdentity(workId: string) {
  if (workId === 'shoot') return SHOOT_QUOTE_OPTIONS.map((o) => ({ name: o.name }))
  if (workId === 'edit') return EDIT_QUOTE_OPTIONS.map((o) => ({ name: o.name }))
  return null
}

export function defaultQuoteDimension(workId: string): string {
  if (workId === 'shoot') return '半天'
  if (workId === 'edit') return '单条剪辑'
  return '抖音'
}

export function dimensionLabelForWorkIdentity(workId: string): string {
  if (workId === 'shoot' || workId === 'edit') return '报价类型'
  return '平台'
}

function supplierMatchPriority(workId: SupplierWorkId): string[] {
  if (workId === 'edit') return ['per_clip', 'full_day', 'half_day']
  return ['full_day', 'half_day']
}

function resolveExclusiveQuoteYuanForSupplier(
  quotes: TalentPrExclusiveQuote[] | undefined,
  opts: { prLingqiId?: string; prRegistryId?: string; workId: SupplierWorkId },
): { quoteYuan: number; dimension: string } | null {
  const list = Array.isArray(quotes) ? quotes : []
  if (!list.length) return null
  const prLq = String(opts.prLingqiId || '').trim()
  const prReg = String(opts.prRegistryId || '').trim()
  for (const dim of supplierMatchPriority(opts.workId)) {
    for (const q of list) {
      if (normalizeQuotePlatform(q.platform) !== dim) continue
      if (prLq && String(q.prLingqiId || '').trim() === prLq) {
        return { quoteYuan: q.quoteYuan, dimension: q.platform }
      }
      if (prReg && String(q.prRegistryId || '').trim() === prReg) {
        return { quoteYuan: q.quoteYuan, dimension: q.platform }
      }
    }
  }
  return null
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

/** 商单是否为「自报价」费用模式（专属价弹窗仅在此类商单展示） */
export function isSelfQuoteRecruitmentOrder(
  orderMeta: Record<string, unknown> | null | undefined,
  mpOrder?: Record<string, unknown> | null,
): boolean {
  const meta = orderMeta && typeof orderMeta === 'object' ? orderMeta : {}
  const feeTypeId = String(meta.feeTypeId || '').trim()
  if (feeTypeId === 'self_quote') return true
  if (feeTypeId === 'level_tier' || feeTypeId === 'fans_tier') {
    return orderMetaHasAnyTierSelfQuote(meta)
  }
  if (feeTypeId && feeTypeId !== 'self_quote') return false
  const budgetText = String((mpOrder && (mpOrder.budgetText || mpOrder.reward)) || '')
  return /自报价/.test(budgetText)
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
  mpOrder?: Record<string, unknown> | null,
): { quoteYuan: number; prLabel: string; dimension?: string } | null {
  if (!isSelfQuoteRecruitmentOrder(orderMeta, mpOrder)) return null
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

export function getExclusiveQuoteOfferForSupplier(
  member: TalentMember | null | undefined,
  orderMeta: Record<string, unknown> | null | undefined,
  workId: SupplierWorkId,
  mpOrder?: Record<string, unknown> | null,
): { quoteYuan: number; prLabel: string; dimension?: string } | null {
  if (!isSelfQuoteRecruitmentOrder(orderMeta, mpOrder)) return null
  const prKeys = readMpPublishPrKeys(orderMeta)
  const hit = resolveExclusiveQuoteYuanForSupplier(member?.prExclusiveQuotes, {
    ...prKeys,
    workId,
  })
  if (!hit || hit.quoteYuan <= 0) return null
  const meta = orderMeta && typeof orderMeta === 'object' ? orderMeta : {}
  const prLabel = String(meta.prDisplayName || prKeys.prLingqiId || '该 PR').trim()
  return { quoteYuan: hit.quoteYuan, prLabel, dimension: hit.dimension }
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
