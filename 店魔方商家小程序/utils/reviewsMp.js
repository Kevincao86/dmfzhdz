const merchantApi = require('./merchantApi.js')
const { readPlatformToken } = require('./platformTokensMp.js')

/**
 * @returns {Promise<{ok:true,items:any[],stats?:object}|{ok:false,message:string}>}
 */
async function fetchReviewsList(
  /** @type {'douyin'|'meituan'|'xhs'} */ platform,
  /** @type {'all'|'good'|'neutral'|'bad'} */ sentiment,
  /** @type {'all'|'replied'|'unreplied'} */ replyStatus,
) {
  const q = `platform=${encodeURIComponent(platform)}&sentiment=${encodeURIComponent(
    sentiment,
  )}&replyStatus=${encodeURIComponent(replyStatus)}`
  const tok = readPlatformToken('douyin')
  try {
    const data = await merchantApi.merchantRequestAuth('GET', `/api/merchant/reviews?${q}`, {
      bearerToken: tok || '',
    })
    const items = Array.isArray(data.items) ? data.items : []
    const stats = data.stats && typeof data.stats === 'object' ? data.stats : undefined
    return { ok: true, items, stats }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

async function postReviewReply(
  /** @type {'douyin'|'meituan'|'xhs'} */ platform,
  /** @type {string} */ reviewId,
  /** @type {string} */ content,
) {
  const tok = readPlatformToken('douyin')
  if (!tok)
    return {
      ok: false,
      message: '请先在电脑端商家后台完成抖音来客店铺授权，再回到小程序查看或回复评价。',
    }
  try {
    const data = await merchantApi.merchantRequestAuth('POST', '/api/merchant/reviews/reply', {
      bearerToken: tok,
      data: { platform, reviewId, content: String(content || '').trim() },
    })
    if (data && data.item) return { ok: true, item: data.item }
    return { ok: false, message: '保存失败，请稍后重试或到电脑端操作。' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

module.exports = { fetchReviewsList, postReviewReply }
