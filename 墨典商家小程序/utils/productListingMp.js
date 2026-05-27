const merchantApi = require('./merchantApi.js')
const { readPlatformToken, apiSegment, PLATFORM_TABS } = require('./platformTokensMp.js')

const FLAT_LIST_PATHS = {
  douyin: '/api/meoo-douyin-goods-products',
  kuaishou: '/api/meoo-kuaishou-goods-products',
  meituan: '/api/meoo-meituan-goods-products',
  xiaohongshu: '/api/meoo-xhs-goods-products',
}

const SYNC_DOUYIN_PATHS = [
  '/api/meoo-douyin-goods-product-sync',
  '/api/merchant/douyin/goods/product/sync',
]

function createPlatformLabel(id) {
  const hit = PLATFORM_TABS.find((p) => p.id === id)
  return hit ? hit.label : id
}

function isRouteMiss404(msg) {
  return /404|not found|could not be found/i.test(String(msg || ''))
}

function listPathCandidates(/** @type {string} */ platform, /** @type {string} */ qs) {
  const seg = apiSegment(platform)
  const merchantPath = seg ? `/api/merchant/${seg}/goods/products${qs}` : null
  const flat = FLAT_LIST_PATHS[platform]
  if (flat && merchantPath) return [`${flat}${qs}`, merchantPath]
  if (flat) return [`${flat}${qs}`]
  if (merchantPath) return [merchantPath]
  return []
}

async function tryGetAuthed(/** @type {string[]} */ paths, /** @type {string} */ token) {
  let lastMsg = '请求失败'
  for (const p of paths) {
    try {
      const data = await merchantApi.merchantRequestAuth('GET', p, { bearerToken: token })
      return { ok: true, data }
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e)
      if (isRouteMiss404(lastMsg)) continue
    }
  }
  return { ok: false, message: lastMsg }
}

async function tryPostAuthed(/** @type {string[]} */ paths, /** @type {string} */ token, body) {
  let lastMsg = '请求失败'
  for (const p of paths) {
    try {
      const data = await merchantApi.merchantRequestAuth('POST', p, { bearerToken: token, data: body })
      return { ok: true, data }
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e)
      if (isRouteMiss404(lastMsg)) continue
    }
  }
  return { ok: false, message: lastMsg }
}

function parseListResponse(data, /** @type {string} */ platform) {
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
      const auditStatus = String(x.audit_status || x.status || '—')
      let saleStatus = String(x.sale_status || '').trim()
      if (!saleStatus) {
        const legacy = String(x.status || '')
        if (legacy === '在售' || legacy.includes('上架')) saleStatus = '上架中'
        else if (legacy === '已下架' || legacy === '封禁') saleStatus = '已下架'
        else saleStatus = '—'
      }
      items.push({
        id,
        name,
        price: Number.isFinite(price) ? price : 0,
        store: String(x.store || '—'),
        status: auditStatus,
        auditStatus,
        saleStatus,
        platform: String(x.platform || createPlatformLabel(platform)),
      })
    }
  }
  const total = typeof d.total === 'number' ? d.total : items.length
  const message = data && typeof data.message === 'string' ? data.message : undefined
  return { items, total, message }
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
  const page = Math.max(1, (opts && opts.page) || 1)
  const pageSize = Math.min(50, Math.max(1, (opts && opts.pageSize) || 20))
  const qs = `?page=${page}&page_size=${pageSize}`
  const paths = listPathCandidates(platform, qs)
  if (!paths.length) return { ok: false, message: '不支持的平台' }
  const r = await tryGetAuthed(paths, token)
  if (!r.ok) {
    const flat = FLAT_LIST_PATHS[platform]
    const hint = flat
      ? `商品列表接口无法访问：请确认商家后台已部署含 ${flat} 的版本，或检查 MERCHANT_API_BASE_URL 是否指向正确站点。`
      : r.message
    return { ok: false, message: hint }
  }
  const parsed = parseListResponse(r.data, platform)
  return { ok: true, items: parsed.items, total: parsed.total, message: parsed.message }
}

/** 当前仅抖音支持同步（与 Web 一致） */
async function postMerchantProductSyncDouyin(/** @type {string} */ productId) {
  const token = readPlatformToken('douyin')
  if (!token) return { ok: false, message: '请先完成抖音来客授权后再同步。' }
  const id = String(productId || '').trim()
  if (!id) return { ok: false, message: '缺少商品 ID' }
  const r = await tryPostAuthed(SYNC_DOUYIN_PATHS, token, { product_id: id })
  if (!r.ok) {
    return {
      ok: false,
      message:
        r.message ||
        '同步接口无法访问：请确认商家后台已部署含 /api/meoo-douyin-goods-product-sync 的版本。',
    }
  }
  const data = r.data || {}
  return { ok: true, message: typeof data.message === 'string' ? data.message : undefined }
}

/** 与 Web postPlatformProductDraft 同源：美团/小红书等通用草稿上品 */
async function postPlatformProductDraft(
  /** @type {string} */ platform,
  /** @type {{ title: string, priceYuan: number, description?: string }} */ payload,
) {
  const token = readPlatformToken(platform)
  if (!token) {
    return { ok: false, message: `未找到${createPlatformLabel(platform)}授权，请先在电脑端系统设置绑定` }
  }
  const seg = apiSegment(platform)
  if (!seg) return { ok: false, message: '不支持的平台' }
  if (platform === 'jd') return { ok: false, message: '京东本地生活暂未接入该接口' }
  try {
    const data = await merchantApi.merchantRequestAuth('POST', `/api/merchant/${seg}/product/draft`, {
      bearerToken: token,
      data: {
        title: String(payload.title || '').trim(),
        priceYuan: payload.priceYuan,
        description: payload.description ? String(payload.description).trim() : undefined,
      },
    })
    const draftId = data && (data.draftId || data.draft_id || (data.data && data.data.draft_id))
    const message = typeof data.message === 'string' ? data.message : undefined
    return { ok: true, draftId: draftId ? String(draftId) : undefined, message }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

module.exports = { fetchMerchantProductList, postMerchantProductSyncDouyin, postPlatformProductDraft, createPlatformLabel }
