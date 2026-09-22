const api = require('./api.js')
const merchantApi = require('./merchantApi.js')
const { readPlatformToken } = require('./platformTokensMp.js')

const PATHS = ['/api/meoo-douyin-goods-ai-assist', '/api/merchant/douyin/goods/ai/assist']

function extractPriceYuan(text) {
  const s = String(text || '')
  const m = s.match(/(?:¥|￥|人民币)?\s*(\d+(?:\.\d{1,2})?)\s*(?:元|块)?/)
  if (!m) return ''
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? String(n) : ''
}

function stripPriceNoise(title) {
  return String(title || '')
    .replace(/[¥￥]\s*\d+(?:\.\d{1,2})?/g, '')
    .replace(/\d+(?:\.\d{1,2})?\s*(?:元|块)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function postAssist(payload) {
  const jwt = api.getBearerToken ? String(api.getBearerToken() || '').trim() : ''
  const dy = readPlatformToken('douyin')
  const bearer = jwt || dy
  if (!bearer) return { ok: false, message: '请先登录' }
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${bearer}`,
  }
  if (jwt) headers['X-Meoo-Access-Token'] = jwt
  if (dy) headers['X-Meoo-Douyin-Token'] = dy
  let lastErr = 'AI 优化失败'
  for (const path of PATHS) {
    try {
      const data = await merchantApi.merchantRequestWithHeaders('POST', path, {
        headers,
        data: payload,
        timeoutMs: 60000,
      })
      if (data && data.ok === false) {
        lastErr = String(data.message || lastErr)
        continue
      }
      const title = String(data.title || data.optimized_title || (data.data && data.data.title) || '').trim()
      const description = String(
        data.description || data.text || data.result || (data.data && data.data.description) || '',
      ).trim()
      return { ok: true, title, description, raw: data }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr }
}

/**
 * 语音草稿 → AI 优化选填；必填（标题/售价）只润色不擅自改价。
 */
async function optimizeVoiceProductDraft(draft, platformLabel) {
  const raw = String((draft && (draft.rawText || draft.title || '')) || '').trim()
  const seedTitle = stripPriceNoise(draft && draft.title ? draft.title : raw.slice(0, 40)) || '团购套餐'
  const seedPrice = String((draft && draft.priceHint) || '').trim() || extractPriceYuan(raw)
  const seedSub = String((draft && draft.subtitle) || '').trim()
  const seedTags = String((draft && draft.tags) || '').trim()
  const plat = platformLabel || '目标平台'

  const base = {
    model: 'qwen',
    product_name: seedTitle,
    title_draft: [
      `请根据商家口述整理${plat}商品资料。`,
      `口述原文：${raw.slice(0, 800) || seedTitle}`,
      seedPrice ? `口述价格：${seedPrice}` : '价格未口述则不要编造具体数字',
    ].join('\n'),
  }

  let title = seedTitle
  let description = seedSub
  let aiNote = ''
  try {
    const [t, d] = await Promise.all([
      postAssist({ ...base, action: 'optimize_title' }),
      postAssist({ ...base, action: 'generate_desc' }),
    ])
    if (t.ok && (t.title || t.description)) title = stripPriceNoise(t.title || t.description).slice(0, 40) || title
    if (d.ok && d.description) description = d.description.slice(0, 2000)
    if (!t.ok && !d.ok) aiNote = t.message || d.message || 'AI 未接通，已用识别结果预填选填项'
    else aiNote = '选填项已由 AI 优化，请核对必填后再上架'
  } catch (e) {
    aiNote = e instanceof Error ? e.message : 'AI 优化未完成，已用识别结果'
  }

  let tags = seedTags
  if (!tags && description) {
    tags = description
      .replace(/[#，。；、\s]+/g, ',')
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x.length >= 2 && x.length <= 8)
      .slice(0, 4)
      .join(',')
  }

  return {
    title,
    priceYuan: extractPriceYuan(seedPrice) || extractPriceYuan(raw),
    description,
    subtitle: description.slice(0, 80),
    tags,
    originYuan: '',
    categoryName: String((draft && draft.categoryName) || '').trim(),
    productType: String((draft && draft.productType) || '').trim(),
    rawText: raw,
    aiNote,
  }
}

module.exports = {
  optimizeVoiceProductDraft,
  extractPriceYuan,
}
