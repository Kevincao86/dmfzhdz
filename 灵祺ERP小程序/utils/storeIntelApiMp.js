const api = require('./api.js')
const { merchantRequestAuth } = require('./merchantApi.js')

function postJson(path, body) {
  const token = api.getAccessToken()
  return merchantRequestAuth('POST', path, { data: body, bearerToken: token }).then((r) => r || {})
}

function normalizePlan(row) {
  if (!row || typeof row !== 'object') return null
  const productName = String(row.productName || row.product_name || '').trim()
  if (!productName) return null
  const suggestedPriceYuan = Number(row.suggestedPriceYuan ?? row.suggested_price_yuan ?? 0)
  return {
    productName,
    suggestedPriceYuan: Number.isFinite(suggestedPriceYuan) ? suggestedPriceYuan : 0,
    originYuan:
      row.originYuan != null
        ? Number(row.originYuan)
        : row.origin_yuan != null
          ? Number(row.origin_yuan)
          : undefined,
    description: String(row.description || '').trim(),
    comboLines: Array.isArray(row.comboLines)
      ? row.comboLines.map((x) => String(x)).filter(Boolean)
      : Array.isArray(row.combo_lines)
        ? row.combo_lines.map((x) => String(x)).filter(Boolean)
        : [],
    marginNote: row.marginNote || row.margin_note,
    competitorNote: row.competitorNote || row.competitor_note,
    riskLevel: row.riskLevel || row.risk_level,
    slotLabel: row.slotLabel || row.slot_label,
  }
}

async function fetchAiProductPlan(body) {
  try {
    const r = await postJson('/api/meoo-ai-product-plan', body)
    if (r.ok && r.plan) {
      const plan = normalizePlan(r.plan)
      if (plan) return { ok: true, plan }
    }
    const msg = [r.error, r.detail, r.message].filter((x) => typeof x === 'string' && x.trim()).join(' — ')
    return { ok: false, message: msg || '生成方案失败' }
  } catch (e) {
    return { ok: false, message: (e && e.message) || '生成方案失败' }
  }
}

async function fetchAiProductPlansBatch(body) {
  try {
    const r = await postJson('/api/meoo-ai-product-plan', body)
    if (r.ok && Array.isArray(r.plans)) {
      const plans = r.plans
        .map((row) => {
          const norm = normalizePlan(row)
          if (!norm) return null
          return Object.assign({}, norm, {
            slotLabel: norm.slotLabel || norm.productName,
          })
        })
        .filter(Boolean)
      if (plans.length) return { ok: true, plans }
    }
    const msg = [r.error, r.detail, r.message].filter((x) => typeof x === 'string' && x.trim()).join(' — ')
    return { ok: false, message: msg || '批量生成方案失败' }
  } catch (e) {
    return { ok: false, message: (e && e.message) || '批量生成方案失败' }
  }
}

module.exports = { fetchAiProductPlan, fetchAiProductPlansBatch }
