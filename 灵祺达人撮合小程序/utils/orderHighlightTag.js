/** 大厅卡片 AI 标签兜底/校验（与 web版 merchant-erp mpRecruitmentMatchShared 对齐） */

const COMMISSION_TAG_RE = /佣金友好|高佣优选|高佣/

function parseCpsPercentFromBudget(budgetText) {
  const m = String(budgetText || '').match(/CPS\s*([\d.]+)\s*%/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function resolveOrderFeeTraits(order) {
  const budgetText = String((order && order.budgetText) || '')
  let cpsPercent = parseCpsPercentFromBudget(budgetText)
  const bd = order && order.budgetDisplay
  if (cpsPercent == null && bd && bd.cps) cpsPercent = parseCpsPercentFromBudget(String(bd.cps))
  let feeMode = 'unknown'
  if (/纯置换/.test(budgetText) || (/置换/.test(budgetText) && !/一口价/.test(budgetText))) feeMode = 'exchange'
  else if (/一口价/.test(budgetText)) feeMode = 'fixed'
  else if (/自报价/.test(budgetText)) feeMode = 'self_quote'
  else if (/等级阶梯|粉丝阶梯/.test(budgetText) || (bd && bd.kind === 'tiers')) feeMode = 'tier'
  const hasCommission = cpsPercent != null && cpsPercent > 0
  return { cpsPercent, feeMode, hasCommission }
}

function pickCategoryHighlightTag(categoryTagsText) {
  const raw = String(categoryTagsText || '').trim()
  if (!raw || raw === '—') return ''
  const first = (raw.split(/[、,，/]/)[0] || '').trim()
  if (!first || first.length > 6) return ''
  return first
}

function fallbackOrderHighlightTag(row, talentCity) {
  if (row.isMock) return { aiTag: '演示', aiTagTone: 'default' }
  if (row.isIce) return { aiTag: '云剪直派', aiTagTone: 'ice' }
  if (row.urgent) return { aiTag: '急单速报', aiTagTone: 'urgent' }
  const region = String(row.region || '')
  if (talentCity && region.includes(talentCity) && !region.includes('全国')) {
    return { aiTag: '同城优选', aiTagTone: 'match' }
  }
  const traits = resolveOrderFeeTraits(row)
  if (traits.hasCommission) return { aiTag: '佣金友好', aiTagTone: 'hot' }
  if (traits.feeMode === 'exchange') return { aiTag: '置换友好', aiTagTone: 'niche' }
  if (traits.feeMode === 'fixed') {
    if ((row.priceAmount || 0) >= 1000) return { aiTag: '高价单', aiTagTone: 'budget' }
    return { aiTag: '一口价', aiTagTone: 'budget' }
  }
  if (traits.feeMode === 'self_quote') return { aiTag: '自报价', aiTagTone: 'match' }
  if (traits.feeMode === 'tier') return { aiTag: '阶梯报价', aiTagTone: 'budget' }
  if ((row.priceAmount || 0) >= 1000) return { aiTag: '高价单', aiTagTone: 'budget' }
  const catTag = pickCategoryHighlightTag(row.categoryTagsText)
  if (catTag) return { aiTag: catTag, aiTagTone: 'niche' }
  if (String(row.fansRequirement || '').includes('不限')) return { aiTag: '门槛低', aiTagTone: 'niche' }
  return { aiTag: '值得看看', aiTagTone: 'default' }
}

function sanitizeAiOrderTag(tag, tone, row) {
  const t = String(tag || '').trim().slice(0, 6)
  if (!t) return null
  const traits = resolveOrderFeeTraits(row)
  if (COMMISSION_TAG_RE.test(t) && !traits.hasCommission) return null
  return { tag: t, tone: String(tone || 'default').trim() || 'default' }
}

function enrichOrderAiPayload(row) {
  const traits = resolveOrderFeeTraits(row)
  return {
    ...row,
    categoryTagsText: row.categoryTagsText || '',
    cpsPercent: traits.cpsPercent,
    feeMode: traits.feeMode,
    hasCommission: traits.hasCommission,
  }
}

module.exports = {
  fallbackOrderHighlightTag,
  sanitizeAiOrderTag,
  enrichOrderAiPayload,
}
