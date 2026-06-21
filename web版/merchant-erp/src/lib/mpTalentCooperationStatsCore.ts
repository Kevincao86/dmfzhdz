import type { RegistryMpRecruitmentApplicant, RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'
import { resolveApplicantSettlementYuan } from './mpApplicantSettlementYuan.js'
import { normalizeQuotePlatform } from './mpTalentPrQuoteShared.js'

export type TalentCooperationPriceStats = {
  minYuan: number
  maxYuan: number
  avgYuan: number
  sampleCount: number
  windowDays: number
}

export type TalentCooperationStatsQuery = {
  key: string
  lingqiTalentId?: string
  talentMemberId?: string
  platformAccount?: string
  wxOpenId?: string
  platform?: string
}

function parseRegistryDate(raw: unknown): number | null {
  const s = String(raw || '').trim()
  if (!s) return null
  const t = Date.parse(s.replace(/\//g, '-'))
  return Number.isFinite(t) ? t : null
}

function orderOwnedByPr(
  order: RegistryMpRecruitmentOrder,
  prLingqiId: string,
  prRegistryId: string,
): boolean {
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : {}
  const lq = String(meta.lingqiPrId || '').trim()
  const reg = String(meta.registryPrId || '').trim()
  if (prLingqiId && lq === prLingqiId) return true
  if (prRegistryId && reg === prRegistryId) return true
  return order.publisherIdentity === 'pr' && !!prLingqiId && lq === prLingqiId
}

function applicantMatchesTalent(
  applicant: RegistryMpRecruitmentApplicant,
  query: TalentCooperationStatsQuery,
): boolean {
  const talentId = String(query.lingqiTalentId || '').trim()
  const memberId = String(query.talentMemberId || '').trim()
  const acc = String(query.platformAccount || '').trim().toLowerCase()
  const openId = String(query.wxOpenId || '').trim()
  const plat = normalizeQuotePlatform(String(query.platform || applicant.platform || 'douyin'))

  const aTalent = String(applicant.talentMemberId || '').trim()
  const aAcc = String(applicant.platformAccount || '').trim().toLowerCase()
  const aOpen = String(applicant.wxOpenId || '').trim()
  const aPlat = normalizeQuotePlatform(String(applicant.platform || ''))

  if (memberId && aTalent && aTalent === memberId) return true
  if (talentId && aTalent && aTalent === talentId) return true
  if (acc && aAcc === acc && (!plat || !aPlat || aPlat === plat)) return true
  if (openId && aOpen && aOpen === openId) return true
  return false
}

export function computeTalentCooperationPriceStats(params: {
  orders: RegistryMpRecruitmentOrder[]
  prLingqiId: string
  prRegistryId?: string
  query: TalentCooperationStatsQuery
  windowDays?: number
}): TalentCooperationPriceStats | null {
  const windowDays = Math.max(1, Math.min(365, params.windowDays ?? 30))
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000
  const prLq = String(params.prLingqiId || '').trim()
  const prReg = String(params.prRegistryId || '').trim()
  if (!prLq && !prReg) return null

  const prices: number[] = []
  for (const order of params.orders) {
    if (!orderOwnedByPr(order, prLq, prReg)) continue
    const applicants = Array.isArray(order.applicants) ? order.applicants : []
    const orderRec = order as unknown as Record<string, unknown>
    for (const applicant of applicants) {
      if (!applicant || !applicantMatchesTalent(applicant, params.query)) continue
      const appliedTs =
        parseRegistryDate(applicant.appliedAt) ||
        parseRegistryDate(applicant.completedAt) ||
        parseRegistryDate(order.updatedAt)
      if (appliedTs != null && appliedTs < cutoff) continue
      const yuan = resolveApplicantSettlementYuan(orderRec, applicant as unknown as Record<string, unknown>)
      if (yuan > 0) prices.push(yuan)
    }
  }

  if (!prices.length) return null
  const sum = prices.reduce((a, b) => a + b, 0)
  return {
    minYuan: Math.min(...prices),
    maxYuan: Math.max(...prices),
    avgYuan: Math.round(sum / prices.length),
    sampleCount: prices.length,
    windowDays,
  }
}

export function batchTalentCooperationPriceStats(params: {
  orders: RegistryMpRecruitmentOrder[]
  prLingqiId: string
  prRegistryId?: string
  talents: TalentCooperationStatsQuery[]
  windowDays?: number
}): Record<string, TalentCooperationPriceStats | null> {
  const out: Record<string, TalentCooperationPriceStats | null> = {}
  for (const q of params.talents) {
    const key = String(q.key || '').trim()
    if (!key) continue
    out[key] = computeTalentCooperationPriceStats({
      orders: params.orders,
      prLingqiId: params.prLingqiId,
      prRegistryId: params.prRegistryId,
      query: q,
      windowDays: params.windowDays,
    })
  }
  return out
}
