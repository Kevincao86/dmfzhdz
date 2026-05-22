const merchantApi = require('./merchantApi.js')
const { readPlatformToken } = require('./platformTokensMp.js')

const SAVE_PATHS = ['/api/meoo-douyin-goods-product-save', '/api/merchant/douyin/goods/product/save']
const CAT_PATHS = ['/api/meoo-douyin-goods-category-get', '/api/merchant/douyin/goods/category/get']
const TYPE_PATHS = ['/api/meoo-douyin-goods-product-types', '/api/merchant/douyin/goods/product-types']
const UPLOAD_PATHS = ['/api/meoo-douyin-goods-image-upload', '/api/merchant/douyin/goods/image/upload']
const STORE_PATH = '/api/merchant/douyin/stores'

function douyinToken() {
  return readPlatformToken('douyin')
}

function authErr() {
  return { ok: false, message: '尚未绑定抖音来客，请在商家后台「系统设置」完成授权' }
}

async function tryGet(paths, query) {
  const token = douyinToken()
  if (!token) return authErr()
  const qs = query ? (query.startsWith('?') ? query : `?${query}`) : ''
  let lastMsg = '请求失败'
  for (const p of paths) {
    try {
      const data = await merchantApi.merchantRequestAuth('GET', `${p}${qs}`, { bearerToken: token })
      return { ok: true, data }
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastMsg)) continue
    }
  }
  return { ok: false, message: lastMsg }
}

async function tryPost(paths, body) {
  const token = douyinToken()
  if (!token) return authErr()
  let lastMsg = '请求失败'
  for (const p of paths) {
    try {
      const data = await merchantApi.merchantRequestAuth('POST', p, {
        bearerToken: token,
        data: body,
      })
      return { ok: true, data }
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastMsg)) continue
    }
  }
  return { ok: false, message: lastMsg }
}

function normalizeNode(raw) {
  if (!raw || typeof raw !== 'object') return null
  const category_id = String(raw.category_id || raw.id || '').trim()
  const name = String(raw.name || raw.category_name || '').trim()
  if (!category_id || !name) return null
  const is_leaf = Boolean(raw.is_leaf ?? raw.leaf)
  let subs = []
  const st = raw.sub_tree_infos || raw.children || raw.sub_categories
  if (Array.isArray(st)) {
    for (const c of st) {
      const n = normalizeNode(c)
      if (n) subs.push(n)
    }
  }
  return { category_id, name, is_leaf, children: subs }
}

function normalizeTreePayload(data) {
  const d = data && typeof data === 'object' ? data : {}
  const inner = d.data && typeof d.data === 'object' ? d.data : d
  const raw =
    inner.category_tree_infos ||
    inner.category_infos ||
    inner.tree ||
    (Array.isArray(inner) ? inner : null)
  if (!Array.isArray(raw)) return []
  const out = []
  for (const row of raw) {
    const n = normalizeNode(row)
    if (n) out.push(n)
  }
  return out
}

async function fetchCategoryTree() {
  const r = await tryGet(CAT_PATHS, 'query_category_type=1')
  if (!r.ok) return r
  const tree = normalizeTreePayload(r.data)
  if (!tree.length) return { ok: false, message: '未获取到类目数据，请确认抖音授权有效' }
  return { ok: true, tree }
}

async function fetchCategoryChildren(parentId) {
  const id = String(parentId || '').trim()
  if (!id) return { ok: true, children: [] }
  const r = await tryGet(CAT_PATHS, `category_id=${encodeURIComponent(id)}`)
  if (!r.ok) return r
  const tree = normalizeTreePayload(r.data)
  if (tree.length === 1 && tree[0].category_id === id && tree[0].children.length) {
    return { ok: true, children: tree[0].children }
  }
  return { ok: true, children: tree }
}

async function fetchProductTypes(leafCategoryId) {
  const id = String(leafCategoryId || '').trim()
  if (!id) return { ok: false, message: '请选择三级类目' }
  const r = await tryGet(TYPE_PATHS, `category_id=${encodeURIComponent(id)}`)
  if (!r.ok) return r
  const d = r.data || {}
  const raw = d.types || (d.data && d.data.types) || d.data
  const types = []
  if (Array.isArray(raw)) {
    for (const t of raw) {
      if (!t || typeof t !== 'object') continue
      const product_type = Number(t.product_type)
      const label = String(t.label || t.name || '').trim()
      if (!label || !Number.isFinite(product_type)) continue
      types.push({ product_type, label, eligible: t.eligible !== false })
    }
  }
  return { ok: true, types }
}

function readFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success(res) {
        resolve(res.data || '')
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '读取图片失败'))
      },
    })
  })
}

async function uploadProductImage(filePath) {
  const token = douyinToken()
  if (!token) return authErr()
  if (!merchantApi.hasMerchantApi()) {
    return { ok: false, message: '请配置商家后台 API 地址（MERCHANT_API_BASE_URL）' }
  }
  let base64 = ''
  try {
    base64 = await readFileBase64(filePath)
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
  const body = {
    fileName: 'product.jpg',
    mimeType: 'image/jpeg',
    contentBase64: base64,
  }
  const r = await tryPost(UPLOAD_PATHS, body)
  if (!r.ok) return r
  const d = r.data || {}
  const url = String(d.url || d.image_url || (d.data && d.data.url) || '').trim()
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, message: '上传成功但未返回图片地址' }
  }
  return { ok: true, url }
}

async function fetchDouyinStores() {
  const token = douyinToken()
  if (!token) return authErr()
  try {
    const data = await merchantApi.merchantRequestAuth('GET', `${STORE_PATH}?page=1&pageSize=50`, {
      bearerToken: token,
    })
    const inner = data && data.data && typeof data.data === 'object' ? data.data : data
    const raw = inner.items || inner.stores || inner.list
    const items = []
    if (Array.isArray(raw)) {
      for (const x of raw) {
        if (!x || typeof x !== 'object') continue
        const id = String(x.poi_id || x.id || x.store_id || '').trim()
        const name = String(x.name || x.poi_name || x.store_name || '').trim()
        if (id && name) items.push({ id, name })
      }
    }
    return { ok: true, items }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

async function saveProduct(mode, detail) {
  const r = await tryPost(SAVE_PATHS, { mode, product: detail })
  if (!r.ok) return r
  const d = r.data || {}
  const product_id = String(d.product_id || (d.data && d.data.product_id) || '').trim()
  if (!product_id && mode === 'submit') {
    return { ok: false, message: d.message || '保存成功但未返回商品 ID' }
  }
  return {
    ok: true,
    product_id,
    message: typeof d.message === 'string' ? d.message : undefined,
  }
}

function buildDefaultPayload(form) {
  const cat = String(form.categoryId || '').trim()
  const name = String(form.productName || '').trim()
  const price = Number.parseFloat(form.priceYuan)
  const head = String(form.headUrl || '').trim()
  const productType = Number(form.productType)
  if (!cat || !name || !Number.isFinite(price) || price <= 0 || !/^https?:\/\//i.test(head)) {
    return null
  }
  if (!Number.isFinite(productType)) return null
  const poiIds = Array.isArray(form.poiIds) ? form.poiIds.filter(Boolean) : []
  const out_id = `mp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const origin = Number.parseFloat(form.originYuan) || price
  return {
    out_id,
    category_id: cat,
    product_type: productType,
    product_name: name,
    product_desc: String(form.productDesc || '').trim() || undefined,
    price_yuan: price,
    origin_price_yuan: origin,
    head_image_urls: [head],
    aux_image_urls: (form.auxUrls || []).filter((u) => /^https?:\/\//i.test(String(u || '').trim())),
    env_image_urls: [],
    poi_ids: poiIds,
    sales_info: {
      channel: 'unlimited',
      staff_sales: false,
      stock_limited: false,
      stock_qty: 999,
      sale_time_limited: false,
    },
    trade_rules: {
      consume_date_mode: 'days',
      consume_valid_days: 360,
      non_consume_date_mode: 'all_dates',
      daily_consume_mode: 'all_day',
      daily_all_day: true,
      customer_purchase_limit_mode: 'none',
      after_sale_policy: 'refund_anytime',
      reserve_mode: 'none',
      reserve_channel: 'phone',
      coupon_type: 'douyin',
    },
    consume_rules: {
      in_store_discount: false,
      extra_fee: false,
      voucher_limit: true,
      voucher_max: 1,
      people_limit: false,
    },
  }
}

module.exports = {
  fetchCategoryTree,
  fetchCategoryChildren,
  fetchProductTypes,
  uploadProductImage,
  fetchDouyinStores,
  saveProduct,
  buildDefaultPayload,
  douyinToken,
}
