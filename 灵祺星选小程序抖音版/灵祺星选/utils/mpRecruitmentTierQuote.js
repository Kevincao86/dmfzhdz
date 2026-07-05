/** 等级/粉丝阶梯：每档 fixed | self_quote，报名与结算共用 */

const TIER_PRICE_MODES = [
  { id: 'fixed', label: '固定价' },
  { id: 'self_quote', label: '自报价' },
]

function parseYuan(raw) {
  const s = String(raw ?? '').replace(/[,¥￥]/g, '').trim()
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function formatYuan(yuan) {
  if (!Number.isFinite(yuan) || yuan <= 0) return ''
  return String(yuan % 1 === 0 ? yuan : Number(yuan.toFixed(2)))
}

function normalizeTierPriceMode(raw) {
  return String(raw || '').trim() === 'self_quote' ? 'self_quote' : 'fixed'
}

function normalizeLevelTier(tier) {
  if (!tier || typeof tier !== 'object') {
    return { id: '', levels: [], levelsText: '请选择等级', price: '', priceMode: 'fixed' }
  }
  return {
    ...tier,
    priceMode: normalizeTierPriceMode(tier.priceMode),
    price: tier.price != null ? String(tier.price) : '',
  }
}

function normalizeFansTier(tier) {
  if (!tier || typeof tier !== 'object') {
    return {
      id: '',
      fansRange: '',
      fansRangeText: '请选择粉丝档位',
      price: '',
      priceMode: 'fixed',
    }
  }
  return {
    ...tier,
    priceMode: normalizeTierPriceMode(tier.priceMode),
    price: tier.price != null ? String(tier.price) : '',
  }
}

function applicantKolLevel(applicant) {
  return String(
    applicant.kolTier || applicant.douyinSalesLevel || applicant.displaySalesLevel || '',
  ).trim()
}

function normalizeKolLevelKey(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (/暂无|无等级|不限/i.test(s)) return ''
  const m = s.match(/lv?\s*(\d+)/i)
  if (m) return `lv${Number(m[1])}`
  return s.toLowerCase()
}

function tierLevelLabels(t) {
  const out = []
  if (Array.isArray(t.levels)) out.push(...t.levels.map((l) => String(l)))
  const txt = String(t.levelsText || '').trim()
  if (txt) out.push(txt)
  return out.filter(Boolean)
}

function levelMatches(kol, levelLabel) {
  const ka = normalizeKolLevelKey(kol)
  const kb = normalizeKolLevelKey(levelLabel)
  if (ka && kb && ka === kb) return true
  const l = String(levelLabel || '').trim().toLowerCase()
  const k = String(kol || '').trim().toLowerCase()
  if (!kol || !l) return false
  return l.includes(k) || k.includes(l)
}

function findMatchingLevelTier(meta, applicant) {
  const tiers = Array.isArray(meta.levelTiers) ? meta.levelTiers : []
  const kol = applicantKolLevel(applicant)
  for (const raw of tiers) {
    const t = normalizeLevelTier(raw)
    const levels = tierLevelLabels(t)
    if (kol && levels.some((l) => levelMatches(kol, l))) return t
  }
  if (tiers.length === 1 && tiers[0]) return normalizeLevelTier(tiers[0])
  return null
}

function fansInRange(fans, range) {
  const r = String(range || '').trim()
  if (!r) return false
  if (r.includes('以下')) {
    const m = r.match(/(\d+)/)
    if (m && fans < Number(m[1])) return true
  }
  const m = r.match(/(\d+)\s*[-~～]\s*(\d+)/)
  if (m) {
    const lo = Number(m[1])
    const hi = Number(m[2])
    return fans >= lo && fans <= hi
  }
  const ge = r.match(/(?:≥|以上)\s*(\d+)/)
  if (ge && fans >= Number(ge[1])) return true
  if (r.includes('以上')) {
    const m2 = r.match(/(\d+)/)
    if (m2 && fans >= Number(m2[1])) return true
  }
  return false
}

function findMatchingFansTier(meta, applicant) {
  const tiers = Array.isArray(meta.fansTiers) ? meta.fansTiers : []
  const fans = Number(applicant.fans || applicant.followers || 0)
  for (const raw of tiers) {
    const t = normalizeFansTier(raw)
    if (fansInRange(fans, t.fansRange)) return t
  }
  if (tiers.length === 1 && tiers[0]) return normalizeFansTier(tiers[0])
  return null
}

function findMatchingTier(meta, applicant) {
  const feeTypeId = String(meta.feeTypeId || '').trim()
  if (feeTypeId === 'level_tier') return findMatchingLevelTier(meta, applicant)
  if (feeTypeId === 'fans_tier') return findMatchingFansTier(meta, applicant)
  return null
}

function resolveTierSettlementYuan(tier, applicant, meta) {
  if (!tier) return 0
  if (normalizeTierPriceMode(tier.priceMode) === 'self_quote') {
    const q = parseYuan(applicant.quotePrice)
    if (q > 0) return q
    return (
      parseYuan(tier.selfQuoteMin) ||
      parseYuan(tier.selfQuoteMax) ||
      parseYuan(meta.selfQuoteMin) ||
      parseYuan(meta.selfQuoteMax)
    )
  }
  return parseYuan(tier.price)
}

function resolveTierDisplayQuote(tier, applicant, meta) {
  if (!tier) return ''
  if (normalizeTierPriceMode(tier.priceMode) === 'self_quote') {
    const q = parseYuan(applicant.quotePrice)
    if (q > 0) return formatYuan(q)
    const min = parseYuan(tier.selfQuoteMin) || parseYuan(meta.selfQuoteMin)
    const max = parseYuan(tier.selfQuoteMax) || parseYuan(meta.selfQuoteMax)
    if (min > 0 && max > 0 && min !== max) return `${min}-${max}`
    if (min > 0) return String(min)
    return '自报价'
  }
  const p = parseYuan(tier.price)
  if (p === 0) return '置换'
  return formatYuan(p)
}

function matchLevelTierSettlementYuan(meta, applicant) {
  const tier = findMatchingLevelTier(meta, applicant)
  return resolveTierSettlementYuan(tier, applicant, meta)
}

function matchFansTierSettlementYuan(meta, applicant) {
  const tier = findMatchingFansTier(meta, applicant)
  return resolveTierSettlementYuan(tier, applicant, meta)
}

function isOrderSelfQuote(meta) {
  return String(meta.feeTypeId || '').trim() === 'self_quote'
}

function applicantNeedsSelfQuoteForApply(meta, draft) {
  const feeTypeId = String(meta.feeTypeId || '').trim()
  if (feeTypeId === 'self_quote') return true
  const tier = findMatchingTier(meta, draft || {})
  return tier ? normalizeTierPriceMode(tier.priceMode) === 'self_quote' : false
}

function applicantTierFixedPriceHint(meta, draft) {
  const feeTypeId = String(meta.feeTypeId || '').trim()
  if (feeTypeId !== 'level_tier' && feeTypeId !== 'fans_tier') return ''
  const tier = findMatchingTier(meta, draft || {})
  if (!tier || normalizeTierPriceMode(tier.priceMode) !== 'fixed') return ''
  const p = parseYuan(tier.price)
  if (p === 0) return '本档酬劳：置换'
  const label =
    feeTypeId === 'level_tier'
      ? (Array.isArray(tier.levels) ? tier.levels.join('、') : '') || applicantKolLevel(draft)
      : String(tier.fansRange || tier.fansRangeText || '').trim()
  return label ? `本单 ${label} 酬劳 ¥${formatYuan(p)}` : `本档酬劳 ¥${formatYuan(p)}`
}

function validateTierApply(meta, draft) {
  const feeTypeId = String(meta.feeTypeId || '').trim()
  if (feeTypeId !== 'level_tier' && feeTypeId !== 'fans_tier') return null
  const tier = findMatchingTier(meta, draft || {})
  if (!tier) {
    if (feeTypeId === 'level_tier') {
      const kol = applicantKolLevel(draft || {})
      return kol ? '您的带货等级不在本单阶梯范围内' : '请选择带货等级以匹配本单酬劳'
    }
    return '您的粉丝量不在本单阶梯范围内'
  }
  if (normalizeTierPriceMode(tier.priceMode) === 'self_quote') {
    const q = parseYuan(draft && draft.quotePrice)
    if (q <= 0) return '请填写您的报价（元）'
  }
  return null
}

function formatTierPriceSummary(tier, kind) {
  const t = kind === 'fans' ? normalizeFansTier(tier) : normalizeLevelTier(tier)
  if (normalizeTierPriceMode(t.priceMode) === 'self_quote') {
    if (kind === 'fans') return `${t.fansRange || t.fansRangeText || '—'} 自报价`
    const lv = (t.levels || []).join('+') || '—'
    return `${lv} 自报价`
  }
  const p = parseYuan(t.price)
  const priceText = p === 0 ? '置换' : `¥${formatYuan(p)}`
  if (kind === 'fans') return `${t.fansRange || t.fansRangeText || '—'} ${priceText}`
  const lv = (t.levels || []).join('+') || '—'
  return `${lv} ${priceText}`
}

function validateTierPublish(tier, index, kind) {
  const t = kind === 'fans' ? normalizeFansTier(tier) : normalizeLevelTier(tier)
  const n = index + 1
  if (kind === 'level') {
    if (!(t.levels || []).length) return `请设置第 ${n} 个阶梯的达人等级`
  } else if (!t.fansRange) {
    return `请设置第 ${n} 个阶梯的粉丝档位`
  }
  if (normalizeTierPriceMode(t.priceMode) === 'fixed') {
    if (String(t.price ?? '').trim() === '') return `请填写第 ${n} 个阶梯的固定价格`
  }
  return null
}

module.exports = {
  TIER_PRICE_MODES,
  parseYuan,
  formatYuan,
  normalizeTierPriceMode,
  normalizeLevelTier,
  normalizeFansTier,
  findMatchingLevelTier,
  findMatchingFansTier,
  findMatchingTier,
  resolveTierSettlementYuan,
  resolveTierDisplayQuote,
  matchLevelTierSettlementYuan,
  matchFansTierSettlementYuan,
  isOrderSelfQuote,
  applicantNeedsSelfQuoteForApply,
  applicantTierFixedPriceHint,
  validateTierApply,
  formatTierPriceSummary,
  validateTierPublish,
}
