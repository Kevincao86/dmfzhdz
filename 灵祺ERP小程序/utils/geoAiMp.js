const merchantApi = require('./merchantApi.js')
const { readPlatformToken } = require('./platformTokensMp.js')

const PATHS_ASSIST = ['/api/meoo-douyin-goods-ai-assist', '/api/merchant/douyin/goods/ai/assist']

async function postDouyinGoodsAiAssist(payload) {
  const token = readPlatformToken('douyin')
  if (!token) throw new Error('请绑定抖音来客')
  let lastErr = ''
  for (const p of PATHS_ASSIST) {
    try {
      return await merchantApi.merchantRequestAuth('POST', p, { bearerToken: token, data: payload })
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr || '请求失败')
}

function extractDescription(data) {
  const desc =
    data && (data.description || (data.data && data.data.description) || data.result || data.text || '')
  return typeof desc === 'string' ? desc.trim() : ''
}

/**
 * GEO AI 咨询（与 Web postGeoAiConsult 同源字段）
 */
async function postGeoAiConsult(body) {
  const data = await postDouyinGoodsAiAssist({
    model: body.model || 'qwen',
    action: 'geo_ai_consult',
    product_name: String(body.store_display_name || '').trim() || '本店 GEO',
    title_draft: String(body.user_question || '').trim(),
    geo_knowledge_pack: String(body.geo_knowledge_pack || '').trim(),
  })
  const description = extractDescription(data)
  if (!description) throw new Error('模型未返回内容')
  return { description, raw: data }
}

async function postGeoAiConsultQuestion(body) {
  const data = await postDouyinGoodsAiAssist({
    model: body.model || 'qwen',
    action: 'geo_ai_consult_question',
    product_name: String(body.store_display_name || '').trim() || '本店 GEO',
    title_draft: 'geo_consult_question',
    geo_knowledge_pack: String(body.geo_knowledge_pack || '').trim(),
  })
  const description = extractDescription(data)
  if (!description) throw new Error('模型未生成问法')
  return { description, raw: data }
}

async function postGeoAiScore(body) {
  const data = await postDouyinGoodsAiAssist({
    model: body.model || 'qwen',
    action: 'geo_ai_score',
    product_name: String(body.product_name || 'GEO综合评分').trim().slice(0, 120),
    title_draft: 'geo_score',
    geo_score_context: String(body.geo_score_context || '').trim(),
  })
  return { raw: data, description: extractDescription(data) }
}

module.exports = {
  postGeoAiConsult,
  postGeoAiConsultQuestion,
  postGeoAiScore,
  extractDescription,
}
