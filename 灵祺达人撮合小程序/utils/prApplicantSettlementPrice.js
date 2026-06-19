const cps = require('./douyinCpsShared.js')

function parseYuan(raw) {
  const s = String(raw ?? '').replace(/[,¥]/g, '').trim()
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function matchLevelTierPrice(meta, applicant) {
  const tiers = Array.isArray(meta.levelTiers) ? meta.levelTiers : []
  const kol = String(applicant.kolTier || applicant.douyinSalesLevel || '').trim()
  for (const t of tiers) {
    if (!t || typeof t !== 'object') continue
    const levels = Array.isArray(t.levels) ? t.levels : []
    if (kol && levels.some((l) => String(l).includes(kol) || kol.includes(String(l)))) {
      return parseYuan(t.price)
    }
  }
  if (tiers.length === 1 && tiers[0] && typeof tiers[0] === 'object') return parseYuan(tiers[0].price)
  return 0
}

function matchFansTierPrice(meta, applicant) {
  const tiers = Array.isArray(meta.fansTiers) ? meta.fansTiers : []
  const fans = Number(applicant.fans || applicant.followers || 0)
  for (const t of tiers) {
    if (!t || typeof t !== 'object') continue
    const range = String(t.fansRange || '')
    const m = range.match(/(\d+)\s*[-~～]\s*(\d+)/)
    if (m) {
      const lo = Number(m[1])
      const hi = Number(m[2])
      if (fans >= lo && fans <= hi) return parseYuan(t.price)
    }
    const ge = range.match(/≥\s*(\d+)/)
    if (ge && fans >= Number(ge[1])) return parseYuan(t.price)
  }
  if (tiers.length === 1 && tiers[0] && typeof tiers[0] === 'object') return parseYuan(tiers[0].price)
  return 0
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
  if (feeTypeId === 'level_tier') return matchLevelTierPrice(meta, applicant)
  if (feeTypeId === 'fans_tier') return matchFansTierPrice(meta, applicant)
  return parseYuan(applicant.quotePrice)
}

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
  resolveCommissionPct,
  buildCpsTalentSettlements,
  douyinCpsCommissionRateFromPct: cps.douyinCpsCommissionRateFromPct,
}
