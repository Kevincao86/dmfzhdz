const api = require('./api.js')
const linkeStore = require('./prDouyinLinkeStore.js')

const BIND_PATHS = ['/api/meoo-douyin-bind', '/api/douyin-bind', '/api/merchant/douyin/bind']
const CPS_SAVE_PATHS = [
  '/api/meoo-douyin-cps-oriented-plan-save',
  '/api/merchant/douyin/cps/oriented-plan/save-video',
]
const GOODS_QUERY_PATHS = [
  '/api/meoo-douyin-goods-product-online-query',
  '/api/merchant/douyin/goods/product-online-query',
]

function authHeaders(token) {
  const h = { Accept: 'application/json', 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function postWithToken(paths, body, token) {
  const payload = JSON.stringify(body)
  const headers = authHeaders(token)
  let lastMsg = '请求失败'
  for (const apiPath of paths) {
    try {
      const data = await api.post(apiPath, JSON.parse(payload))
      if (data && data.ok === false) {
        lastMsg = String(data.message || '请求失败')
        return { ok: false, message: lastMsg }
      }
      return { ok: true, data: data || {} }
    } catch (e) {
      lastMsg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(lastMsg)) return { ok: false, message: lastMsg }
    }
  }
  return { ok: false, message: lastMsg }
}

async function postPrDouyinBind(payload) {
  const r = await postWithToken(BIND_PATHS, payload, '')
  if (!r.ok) return r
  const token = String((r.data && r.data.accessToken) || '').trim()
  if (!token) return { ok: false, message: '绑定成功但未返回 accessToken' }
  return {
    ok: true,
    accessToken: token,
    accountName: r.data.accountName,
  }
}

async function searchPrDouyinProducts(client, keyword) {
  linkeStore.applyPrDouyinClientSession(client)
  const token = linkeStore.readPrDouyinClientSessionToken() || client.sealedToken
  const r = await postWithToken(
    GOODS_QUERY_PATHS,
    { product_name: keyword, count: 20, goods_query_type: 3 },
    token,
  )
  if (!r.ok) return r
  const hits = ((r.data && r.data.hits) || [])
    .map((h) => ({
      id: String(h.product_id || '').trim(),
      name: String(h.product_name || h.product_id || '').trim(),
    }))
    .filter((x) => x.id)
  return { ok: true, hits }
}

async function savePrDouyinVideoOrientedPlan(client, payload) {
  linkeStore.applyPrDouyinClientSession(client)
  const token = linkeStore.readPrDouyinClientSessionToken() || client.sealedToken
  const r = await postWithToken(
    CPS_SAVE_PATHS,
    Object.assign({}, payload, { account_id: client.merchantAccountId }),
    token,
  )
  if (!r.ok) return r
  const planId = String((r.data && r.data.plan_id) || '').trim()
  if (!planId) return { ok: false, message: '抖音未返回 plan_id' }
  return { ok: true, planId }
}

module.exports = {
  postPrDouyinBind,
  searchPrDouyinProducts,
  savePrDouyinVideoOrientedPlan,
}
