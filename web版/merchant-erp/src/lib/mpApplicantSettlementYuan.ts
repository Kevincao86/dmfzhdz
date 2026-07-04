/** 按招募单计费方式解析达人结算费用（元）— 服务端与统计共用 */
import {
  findMatchingTier,
  matchFansTierSettlementYuan,
  matchLevelTierSettlementYuan,
  parseYuan,
  resolveTierDisplayQuote,
} from './mpRecruitmentTierQuote.js'

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
  if (feeTypeId === 'level_tier') return matchLevelTierSettlementYuan(meta, applicant)
  if (feeTypeId === 'fans_tier') return matchFansTierSettlementYuan(meta, applicant)
  return parseYuan(applicant.quotePrice)
}

function formatQuoteDisplayYuan(yuan: number, feeTypeId: string): string {
  if (feeTypeId === 'exchange_only') return '置换'
  if (!Number.isFinite(yuan) || yuan <= 0) return ''
  return String(yuan % 1 === 0 ? yuan : Number(yuan.toFixed(2)))
}

/** PR 报名管理卡片「报价」：阶梯固定价自动匹配，自报价档显示达人填写值 */
export function resolveApplicantDisplayQuotePrice(
  mpOrder: Record<string, unknown>,
  applicant: Record<string, unknown>,
): string {
  const meta =
    mpOrder.mpPublishMeta && typeof mpOrder.mpPublishMeta === 'object'
      ? (mpOrder.mpPublishMeta as Record<string, unknown>)
      : {}
  const feeTypeId = String(meta.feeTypeId || '').trim()
  if (feeTypeId === 'self_quote') {
    const q = parseYuan(applicant.quotePrice)
    if (q > 0) return formatQuoteDisplayYuan(q, feeTypeId)
    const min = parseYuan(meta.selfQuoteMin)
    const max = parseYuan(meta.selfQuoteMax)
    if (min > 0 && max > 0 && min !== max) return `${min}-${max}`
    if (min > 0) return String(min)
    if (max > 0) return String(max)
    return String(applicant.quotePrice || '').trim()
  }
  if (feeTypeId === 'level_tier' || feeTypeId === 'fans_tier') {
    const tier = findMatchingTier(meta, applicant)
    const text = resolveTierDisplayQuote(tier, applicant, meta)
    if (text) return text
  }
  const yuan = resolveApplicantSettlementYuan(mpOrder, applicant)
  const text = formatQuoteDisplayYuan(yuan, feeTypeId)
  if (text) return text
  return String(applicant.quotePrice || '').trim()
}
