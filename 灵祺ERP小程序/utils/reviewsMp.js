const merchantApi = require('./merchantApi.js')
const { multiPlatformMerchantHeaders, tokenForReviewsApiPlatform } = require('./merchantHeadersMp.js')

/**
 * @param {string} platform douyin | kuaishou | meituan | xhs | eleme | meituan_waimai | jd_waimai
 * @param {'all'|'good'|'neutral'|'bad'} sentiment
 * @param {'all'|'replied'|'unreplied'} replyStatus
 * @param {{ kind?: 'store'|'product'; poiId?: string; productId?: string }} [opts]
 * @returns {Promise<{ok:true,items:any[],stats?:object,syncedAt?:string}|{ok:false,message:string}>}
 */
async function fetchReviewsList(platform, sentiment, replyStatus, opts = {}) {
  const q = new URLSearchParams({ platform, sentiment, replyStatus })
  if (opts.kind === 'product' || opts.kind === 'store') q.set('kind', opts.kind)
  if (opts.poiId && String(opts.poiId).trim()) q.set('poiId', String(opts.poiId).trim())
  if (opts.productId && String(opts.productId).trim()) q.set('productId', String(opts.productId).trim())

  const tries = [`/api/meoo-merchant-reviews?${q}`, `/api/merchant/reviews?${q}`]
  const headers = multiPlatformMerchantHeaders()
  let lastErr = '评论列表拉取失败'
  for (const path of tries) {
    try {
      const data = await merchantApi.merchantRequestWithHeaders('GET', path, { headers })
      const items = Array.isArray(data.items) ? data.items : []
      const stats = data.stats && typeof data.stats === 'object' ? data.stats : undefined
      const syncedAt = typeof data.syncedAt === 'string' ? data.syncedAt : undefined
      return { ok: true, items, stats, syncedAt }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr }
}

/**
 * @param {string} platform
 * @param {{ kind?: 'store'|'product'; poiId?: string; productId?: string; poiIds?: string[]; productIds?: string[] }} [opts]
 */
async function postReviewsSync(platform, opts = {}) {
  const body = {
    platform,
    kind: opts.kind,
    poiId: opts.poiId,
    productId: opts.productId,
    poiIds: opts.poiIds,
    productIds: opts.productIds,
  }
  const tries = ['/api/meoo-merchant-reviews-sync', '/api/merchant/reviews/sync']
  const headers = multiPlatformMerchantHeaders()
  let lastErr = '同步失败'
  for (const path of tries) {
    try {
      const data = await merchantApi.merchantRequestWithHeaders('POST', path, { headers, data: body })
      const items = Array.isArray(data.items) ? data.items : undefined
      const syncedAt = typeof data.syncedAt === 'string' ? data.syncedAt : undefined
      const message = typeof data.message === 'string' ? data.message : ''
      return { ok: true, items, syncedAt, message }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr }
}

/**
 * @param {string} apiPlatform
 * @param {string} reviewId
 * @param {string} content
 */
async function postReviewReply(apiPlatform, reviewId, content) {
  const headers = multiPlatformMerchantHeaders()
  const body = { platform: apiPlatform, reviewId, content: String(content || '').trim() }
  const tries = ['/api/meoo-merchant-reviews-reply', '/api/merchant/reviews/reply']
  let lastErr = '回复失败'
  for (const path of tries) {
    try {
      const data = await merchantApi.merchantRequestWithHeaders('POST', path, { headers, data: body })
      if (data && data.item) return { ok: true, item: data.item }
      lastErr = data.message || '保存失败'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  const tok = tokenForReviewsApiPlatform(apiPlatform)
  if (!tok) {
    return { ok: false, message: '请先在小程序完成对应平台的店铺授权绑定。' }
  }
  try {
    const data = await merchantApi.merchantRequestAuth('POST', '/api/merchant/reviews/reply', {
      bearerToken: tok,
      data: body,
    })
    if (data && data.item) return { ok: true, item: data.item }
    return { ok: false, message: '保存失败，请稍后重试。' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

async function postReviewAiSuggest(apiPlatform, reviewId) {
  const headers = multiPlatformMerchantHeaders()
  const body = { platform: apiPlatform, reviewId }
  const tries = ['/api/meoo-merchant-reviews-ai-suggest', '/api/merchant/reviews/ai-suggest']
  let lastErr = '话术生成失败'
  for (const path of tries) {
    try {
      const data = await merchantApi.merchantRequestWithHeaders('POST', path, { headers, data: body })
      const suggestion = String(data.suggestion || data.text || '').trim()
      if (suggestion) return { ok: true, text: suggestion }
      lastErr = data.message || '未返回话术'
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return { ok: false, message: lastErr }
}

module.exports = {
  fetchReviewsList,
  postReviewsSync,
  postReviewReply,
  postReviewAiSuggest,
}
