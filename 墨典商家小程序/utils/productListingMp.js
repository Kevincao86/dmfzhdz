const merchantApi = require('./merchantApi.js')
const { readPlatformToken, apiSegment, PLATFORM_TABS } = require('./platformTokensMp.js')

function createPlatformLabel(id) {
  const hit = PLATFORM_TABS.find((p) => p.id === id)
  return hit ? hit.label : id
}

/**
 * 对齐 web版/merchant-erp/src/services/productListingApi.ts
 * @returns {Promise<{ok:true,items:any[],total:number,message?:string}|{ok:false,message:string}>}
 */
async function fetchMerchantProductList(/** @type {string} */ platform, opts) {
  if (platform === 'jd') {
    return { ok: true, items: [], total: 0, message: '京东本地生活商品列表尚未接入' }
  }
  const token = readPlatformToken(platform)
  if (!token) {
    return {
      ok: false,
      message:
        '尚未绑定对应平台。请在商家后台「系统设置」完成授权，并将 accessToken 写入本机（键名与 Web 一致，如 meoo_douyin_merchant_token）。',
    }
  }
  const seg = apiSegment(platform)
  if (!seg) return { ok: false, message: '不支持的平台' }
  const page = Math.max(1, (opts && opts.page) || 1)
  const pageSize = Math.min(50, Math.max(1, (opts && opts.pageSize) || 20))
  const q = `page=${page}&page_size=${pageSize}`
  try {
    const data = await merchantApi.merchantRequestAuth('GET', `/api/merchant/${seg}/goods/products?${q}`, {
      bearerToken: token,
    })
    const d = data && typeof data === 'object' && data.data && typeof data.data === 'object' ? data.data : {}
    const raw = d.items
    const items = []
    if (Array.isArray(raw)) {
      for (const x of raw) {
        if (!x || typeof x !== 'object') continue
        const id = String(x.id || '').trim()
        const name = String(x.name || '').trim()
        if (!id || !name) continue
        const price = Number(x.price)
        items.push({
          id,
          name,
          price: Number.isFinite(price) ? price : 0,
          store: String(x.store || '—'),
          status: String(x.status || '—'),
          platform: String(x.platform || createPlatformLabel(platform)),
        })
      }
    }
    const total = typeof d.total === 'number' ? d.total : items.length
    const message = typeof data.message === 'string' ? data.message : undefined
    return { ok: true, items, total, message }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg }
  }
}

/** 当前仅抖音支持同步（与 Web 一致） */
async function postMerchantProductSyncDouyin(/** @type {string} */ productId) {
  const token = readPlatformToken('douyin')
  if (!token) return { ok: false, message: '请先完成抖音来客授权后再同步。' }
  const id = String(productId || '').trim()
  if (!id) return { ok: false, message: '缺少商品 ID' }
  try {
    const data = await merchantApi.merchantRequestAuth('POST', '/api/merchant/douyin/goods/product/sync', {
      bearerToken: token,
      data: { product_id: id },
    })
    return { ok: true, message: typeof data.message === 'string' ? data.message : undefined }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

module.exports = { fetchMerchantProductList, postMerchantProductSyncDouyin, createPlatformLabel }
