/**
 * 商家 ERP 小程序 · 菜单/竞对/数字人 TTS / AI 运营方案
 * （对齐商家 Web，不含服务商分版）
 */
const api = require('./api.js')
const { merchantRequestAuth } = require('./merchantApi.js')
const sessionSync = require('./merchantSessionSyncMp.js')
const supabaseRest = require('./supabaseRest.js')

function postJson(path, body) {
  const token = api.getAccessToken()
  return merchantRequestAuth('POST', path, { data: body || {}, bearerToken: token }).then((r) => r || {})
}

function tenantId() {
  try {
    return String(wx.getStorageSync(sessionSync.MEOO_ACTIVE_TENANT_ID) || '').trim()
  } catch (_) {
    return ''
  }
}

function menuStorageKey() {
  const tid = tenantId()
  return tid ? `meoo_store_menu_v1@${tid}` : 'meoo_store_menu_v1'
}

function marginStorageKey() {
  const tid = tenantId()
  return tid ? `meoo_store_margin_config_v1@${tid}` : 'meoo_store_margin_config_v1'
}

function readJson(key) {
  try {
    const raw = wx.getStorageSync(key)
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (_) {
    return null
  }
}

function readStoreMenu() {
  const menu = readJson(menuStorageKey()) || {}
  const items = Array.isArray(menu.items) ? menu.items : []
  return {
    storeName: String(menu.storeName || '').trim(),
    items,
    updatedAt: menu.updatedAt || '',
  }
}

function writeStoreMenuLocal(rec) {
  const payload = {
    id: rec.id || `menu-mp-${Date.now()}`,
    storeName: String(rec.storeName || '').trim(),
    images: Array.isArray(rec.images) ? rec.images : [],
    items: Array.isArray(rec.items) ? rec.items : [],
    updatedAt: new Date().toISOString(),
  }
  try {
    wx.setStorageSync(menuStorageKey(), JSON.stringify(payload))
  } catch (_) {}
  return payload
}

/** 本地 + 云端双写（对齐 Web saveStoreMenuRecordAsync） */
async function saveStoreMenu(rec) {
  const payload = writeStoreMenuLocal(rec)
  const tid = tenantId()
  if (!tid) return { ok: true, localOnly: true, payload }
  try {
    await supabaseRest.upsertTenantStoreMenu(tid, {
      items: payload.items,
      storeName: payload.storeName,
    })
    return { ok: true, payload }
  } catch (e) {
    return {
      ok: false,
      payload,
      message: (e && e.message) || '云端保存失败（本地已更新）',
    }
  }
}

function readMargins() {
  const margin = readJson(marginStorageKey())
  const m = margin && margin.margins ? margin.margins : {}
  return {
    douyin: typeof m.douyin === 'number' ? m.douyin : 38,
    meituan: typeof m.meituan === 'number' ? m.meituan : 35,
    xhs: typeof m.xhs === 'number' ? m.xhs : 32,
  }
}

function readIndustryPath() {
  const margin = readJson(marginStorageKey())
  const industry = margin && margin.industry ? margin.industry : {}
  return String(industry.path || industry.name || '').trim()
}

function menuSummaryLines(items, max) {
  const limit = max || 40
  const list = Array.isArray(items) ? items : []
  const lines = list
    .slice(0, limit)
    .map((it) => {
      const name = String((it && it.name) || '').trim()
      if (!name) return ''
      const p =
        it && typeof it.priceYuan === 'number' && Number.isFinite(it.priceYuan)
          ? ` ¥${it.priceYuan}`
          : ''
      const cat = it && it.category ? `[${it.category}] ` : ''
      return `${cat}${name}${p}`
    })
    .filter(Boolean)
  if (list.length > limit) lines.push(`…共 ${list.length} 项`)
  return lines.join('\n')
}

async function runCompetitorAnalysis(body) {
  try {
    const r = await postJson('/api/meoo-competitor-analysis', body)
    if (r.ok && r.summary) {
      return {
        ok: true,
        summary: String(r.summary),
        industryHint: r.industryHint,
        competitors: Array.isArray(r.competitors) ? r.competitors : [],
        suggestions: Array.isArray(r.suggestions) ? r.suggestions : [],
      }
    }
    return { ok: false, message: String(r.error || r.message || r.detail || '分析失败') }
  } catch (e) {
    return { ok: false, message: (e && e.message) || '分析失败' }
  }
}

async function synthesizeDigitalHumanTts(body) {
  try {
    const payload = Object.assign({ tenantId: tenantId() || undefined }, body || {})
    const r = await postJson('/api/meoo-digital-human-tts', payload)
    if (r.ok && r.audioBase64) {
      return {
        ok: true,
        audioBase64: String(r.audioBase64),
        mimeType: String(r.mimeType || 'audio/mpeg'),
      }
    }
    return { ok: false, message: String(r.message || r.error || r.detail || '合成失败') }
  } catch (e) {
    return { ok: false, message: (e && e.message) || '合成失败' }
  }
}

function normalizeOpsPlan(plan) {
  if (!plan || typeof plan !== 'object') return null
  const ops = plan.opsPlan || {}
  const exec = plan.executionPlan || {}
  const budget = plan.marketingBudget || {}
  return {
    background: String(ops.background || '').trim(),
    backgroundDetail: String(ops.backgroundDetail || '').trim(),
    positioning: String(ops.positioning || '').trim(),
    activities: String(ops.activities || '').trim(),
    targetAudience: String(ops.targetAudience || '').trim(),
    goals: Array.isArray(ops.goals) ? ops.goals.map((x) => String(x)).filter(Boolean) : [],
    risks: Array.isArray(ops.risks) ? ops.risks.map((x) => String(x)).filter(Boolean) : [],
    contentPillars: Array.isArray(ops.contentPillars)
      ? ops.contentPillars.map((x) => String(x)).filter(Boolean)
      : [],
    overview: String(exec.overview || '').trim(),
    totalBudget: typeof budget.totalBudget === 'number' ? budget.totalBudget : 0,
    roiSummary: String(budget.roiSummary || '').trim(),
    assumptions: String(budget.assumptions || '').trim(),
  }
}

async function generateAiOpsPlan(body) {
  try {
    const r = await postJson('/api/meoo-ai-ops-plan', body)
    if (r.ok && r.plan) {
      const plan = normalizeOpsPlan(r.plan)
      if (plan && (plan.background || plan.positioning || plan.goals.length)) {
        return {
          ok: true,
          plan,
          pointsCharged: typeof r.pointsCharged === 'number' ? r.pointsCharged : undefined,
          pointsBalance: typeof r.pointsBalance === 'number' ? r.pointsBalance : undefined,
        }
      }
      return { ok: false, message: '方案内容不完整，请重试' }
    }
    return { ok: false, message: String(r.message || r.error || r.detail || '生成失败') }
  } catch (e) {
    return { ok: false, message: (e && e.message) || '生成失败' }
  }
}

module.exports = {
  tenantId,
  readStoreMenu,
  writeStoreMenuLocal,
  saveStoreMenu,
  readMargins,
  readIndustryPath,
  menuSummaryLines,
  runCompetitorAnalysis,
  synthesizeDigitalHumanTts,
  generateAiOpsPlan,
}
