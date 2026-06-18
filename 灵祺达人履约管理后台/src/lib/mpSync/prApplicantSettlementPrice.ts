import {
  douyinCpsCommissionRateFromPct,
  extractDouyinTalentId,
  isLikelyDouyinTalentId,
} from '@merchant/lib/douyinCpsShared'
import type { CpsTalentSettlement } from '@merchant/lib/opsRegistryTypes'

function parseYuan(raw: unknown): number {
  const s = String(raw ?? '').replace(/[,¥]/g, '').trim()
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function matchLevelTierPrice(
  meta: Record<string, unknown>,
  applicant: Record<string, unknown>,
): number {
  const tiers = Array.isArray(meta.levelTiers) ? meta.levelTiers : []
  const kol = String(applicant.kolTier || applicant.douyinSalesLevel || '').trim()
  for (const t of tiers) {
    if (!t || typeof t !== 'object') continue
    const levels = Array.isArray((t as { levels?: unknown[] }).levels)
      ? ((t as { levels: unknown[] }).levels as string[])
      : []
    if (kol && levels.some((l) => String(l).includes(kol) || kol.includes(String(l)))) {
      return parseYuan((t as { price?: unknown }).price)
    }
  }
  if (tiers.length === 1 && tiers[0] && typeof tiers[0] === 'object') {
    return parseYuan((tiers[0] as { price?: unknown }).price)
  }
  return 0
}

function matchFansTierPrice(meta: Record<string, unknown>, applicant: Record<string, unknown>): number {
  const tiers = Array.isArray(meta.fansTiers) ? meta.fansTiers : []
  const fans = Number(applicant.fans || applicant.followers || 0)
  for (const t of tiers) {
    if (!t || typeof t !== 'object') continue
    const range = String((t as { fansRange?: string }).fansRange || '')
    const m = range.match(/(\d+)\s*[-~～]\s*(\d+)/)
    if (m) {
      const lo = Number(m[1])
      const hi = Number(m[2])
      if (fans >= lo && fans <= hi) return parseYuan((t as { price?: unknown }).price)
    }
    const ge = range.match(/≥\s*(\d+)/)
    if (ge && fans >= Number(ge[1])) return parseYuan((t as { price?: unknown }).price)
  }
  if (tiers.length === 1 && tiers[0] && typeof tiers[0] === 'object') {
    return parseYuan((tiers[0] as { price?: unknown }).price)
  }
  return 0
}

/** 按招募单计费方式解析达人结算费用（元） */
export function resolveApplicantSettlementYuan(
  mpOrder: Record<string, unknown>,
  applicant: Record<string, unknown>,
): number {
  const meta =
    mpOrder.mpPublishMeta && typeof mpOrder.mpPublishMeta === 'object'
      ? (mpOrder.mpPublishMeta as Record<string, unknown>)
      : {}
  const feeTypeId = String(meta.feeTypeId || '').trim()
  if (feeTypeId === 'fixed') return parseYuan(meta.fixedPrice)
  if (feeTypeId === 'self_quote') {
    const q = parseYuan(applicant.quotePrice)
    if (q > 0) return q
    return parseYuan(meta.selfQuoteMin) || parseYuan(meta.selfQuoteMax)
  }
  if (feeTypeId === 'exchange_only') return 0
  if (feeTypeId === 'level_tier') return matchLevelTierPrice(meta, applicant)
  if (feeTypeId === 'fans_tier') return matchFansTierPrice(meta, applicant)
  return parseYuan(applicant.quotePrice)
}

export function resolveCommissionPct(mpOrder: Record<string, unknown>): number {
  const meta =
    mpOrder.mpPublishMeta && typeof mpOrder.mpPublishMeta === 'object'
      ? (mpOrder.mpPublishMeta as Record<string, unknown>)
      : {}
  const raw = meta.cpsPercent ?? ''
  const m = String(raw).match(/([\d.]+)/)
  return m ? Math.max(0, Math.min(80, Number(m[1]) || 0)) : 0
}

export function buildCpsTalentSettlements(
  mpOrder: Record<string, unknown>,
  applicants: Record<string, unknown>[],
): CpsTalentSettlement[] {
  const commissionPct = resolveCommissionPct(mpOrder)
  return applicants
    .map((a) => {
      const douyinId = extractDouyinTalentId({
        platformAccount: String(a.platformAccount || ''),
        platformNickname: String(a.platformNickname || a.name || ''),
        name: String(a.name || ''),
      })
      if (!douyinId || !isLikelyDouyinTalentId(douyinId)) return null
      return {
        applicantId: String(a.id || ''),
        douyinId,
        displayName: String(a.platformNickname || a.name || '').trim(),
        settlementFeeYuan: resolveApplicantSettlementYuan(mpOrder, a),
        commissionPct,
      }
    })
    .filter((x): x is CpsTalentSettlement => !!x && !!x.applicantId)
}

export { douyinCpsCommissionRateFromPct }
