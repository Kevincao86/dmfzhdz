/** 按招募单计费方式解析达人结算费用（元）— 服务端与统计共用 */
function parseYuan(raw: unknown): number {
  const s = String(raw ?? '').replace(/[,¥￥]/g, '').trim()
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function matchLevelTierPrice(meta: Record<string, unknown>, applicant: Record<string, unknown>): number {
  const tiers = Array.isArray(meta.levelTiers) ? meta.levelTiers : []
  const kol = String(
    applicant.kolTier || applicant.douyinSalesLevel || applicant.displaySalesLevel || '',
  ).trim()
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

function formatQuoteDisplayYuan(yuan: number, feeTypeId: string): string {
  if (feeTypeId === 'exchange_only') return '置换'
  if (!Number.isFinite(yuan) || yuan <= 0) return ''
  return String(yuan % 1 === 0 ? yuan : Number(yuan.toFixed(2)))
}

/** PR 报名管理卡片「报价」：自报价用达人填写值，其余按商单计费方式解析 */
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
  const yuan = resolveApplicantSettlementYuan(mpOrder, applicant)
  const text = formatQuoteDisplayYuan(yuan, feeTypeId)
  if (text) return text
  return String(applicant.quotePrice || '').trim()
}
