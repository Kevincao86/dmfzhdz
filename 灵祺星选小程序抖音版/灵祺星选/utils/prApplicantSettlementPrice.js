/** 按招募单计费方式解析达人结算费用（元） */
const tierQuote = require('./mpRecruitmentTierQuote.js')

function parseYuan(raw) {
  return tierQuote.parseYuan(raw)
}

function resolveApplicantSettlementYuan(mpOrder, applicant) {
  const meta =
    mpOrder.mpPublishMeta && typeof mpOrder.mpPublishMeta === 'object' ? mpOrder.mpPublishMeta : {}
  const feeTypeId = String(meta.feeTypeId || '').trim()
  if (feeTypeId === 'fixed') return parseYuan(meta.fixedPrice)
  if (feeTypeId === 'self_quote') {
    const q = parseYuan(applicant.quotePrice)
    if (q > 0) return q
    return parseYuan(meta.selfQuoteMin) || parseYuan(meta.selfQuoteMax)
  }
  if (feeTypeId === 'exchange_only') return 0
  if (feeTypeId === 'level_tier') return tierQuote.matchLevelTierSettlementYuan(meta, applicant)
  if (feeTypeId === 'fans_tier') return tierQuote.matchFansTierSettlementYuan(meta, applicant)
  return parseYuan(applicant.quotePrice)
}

function formatQuoteDisplayYuan(yuan, feeTypeId) {
  if (feeTypeId === 'exchange_only') return '置换'
  if (!Number.isFinite(yuan) || yuan <= 0) return ''
  return String(yuan % 1 === 0 ? yuan : Number(yuan.toFixed(2)))
}

/** PR 报名管理卡片「报价」：阶梯固定价自动匹配，自报价档显示达人填写值 */
function resolveApplicantDisplayQuotePrice(mpOrder, applicant) {
  const meta =
    mpOrder.mpPublishMeta && typeof mpOrder.mpPublishMeta === 'object' ? mpOrder.mpPublishMeta : {}
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
    const tier = tierQuote.findMatchingTier(meta, applicant)
    const text = tierQuote.resolveTierDisplayQuote(tier, applicant, meta)
    if (text) return text
  }
  const yuan = resolveApplicantSettlementYuan(mpOrder, applicant)
  const text = formatQuoteDisplayYuan(yuan, feeTypeId)
  if (text) return text
  return String(applicant.quotePrice || '').trim()
}

const cps = require('./douyinCpsShared.js')

function resolveCommissionPct(mpOrder) {
  const meta =
    mpOrder.mpPublishMeta && typeof mpOrder.mpPublishMeta === 'object' ? mpOrder.mpPublishMeta : {}
  const raw = meta.cpsPercent != null ? meta.cpsPercent : ''
  const m = String(raw).match(/([\d.]+)/)
  return m ? Math.max(0, Math.min(80, Number(m[1]) || 0)) : 0
}

function buildCpsTalentSettlements(mpOrder, applicants) {
  const commissionPct = resolveCommissionPct(mpOrder)
  const rows = []
  for (const a of applicants || []) {
    const douyinId = cps.extractDouyinTalentId({
      platformAccount: String(a.platformAccount || ''),
      platformNickname: String(a.platformNickname || a.name || ''),
      name: String(a.name || ''),
    })
    if (!douyinId || !cps.isLikelyDouyinTalentId(douyinId)) continue
    const applicantId = String(a.id || '').trim()
    if (!applicantId) continue
    const displayName = String(a.platformNickname || a.name || '').trim()
    rows.push({
      applicantId,
      douyinId,
      displayName: displayName || undefined,
      settlementFeeYuan: resolveApplicantSettlementYuan(mpOrder, a),
      commissionPct,
    })
  }
  return rows
}

module.exports = {
  resolveApplicantSettlementYuan,
  resolveApplicantDisplayQuotePrice,
  resolveCommissionPct,
  buildCpsTalentSettlements,
  douyinCpsCommissionRateFromPct: cps.douyinCpsCommissionRateFromPct,
}
