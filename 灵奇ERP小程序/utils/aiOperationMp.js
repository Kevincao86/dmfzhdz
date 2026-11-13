const merchantApi = require('./merchantApi.js')
const { readPlatformToken } = require('./platformTokensMp.js')

const PATHS_ASSIST = ['/api/meoo-douyin-goods-ai-assist', '/api/merchant/douyin/goods/ai/assist']

async function postAssist(payload) {
  const token = readPlatformToken('douyin')
  if (!token) return { ok: false, message: '请先在小程序绑定抖音来客' }
  let lastErr = ''
  for (const p of PATHS_ASSIST) {
    try {
      const data = await merchantApi.merchantRequestAuth('POST', p, { bearerToken: token, data: payload })
      const desc =
        data && (data.description || (data.data && data.data.description) || data.result || data.text || '')
      const text = typeof desc === 'string' ? desc.trim() : ''
      if (text) return { ok: true, text }
      lastErr = data.message || '未返回正文'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  return { ok: false, message: lastErr }
}

/**
 * 对齐 Web AiOperationContentPage：operation_article / operation_topic
 * @param {'operation_article'|'operation_topic'} action
 * @param {{ productContextName: string; titleDraft: string; model?: string }} args
 */
async function postAiOperationAssist(action, args) {
  return postAssist({
    model: args.model || 'qwen',
    action,
    product_name: args.productContextName.trim().slice(0, 200),
    title_draft: args.titleDraft.trim(),
  })
}

module.exports = { postAiOperationAssist }
