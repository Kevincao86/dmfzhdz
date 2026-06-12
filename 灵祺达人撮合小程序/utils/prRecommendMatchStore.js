/** PR 推荐大厅智能匹配结果缓存：仅新发单/切换匹配招募单时失效 */

const KEY = 'meoo_mp_pr_recommend_enriched_v2'

function readStore() {
  try {
    const raw = wx.getStorageSync(KEY)
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!j || typeof j !== 'object') return {}
    return j.data && typeof j.data === 'object' ? j.data : j
  } catch (_) {
    return {}
  }
}

function writeStore(data) {
  try {
    wx.setStorageSync(KEY, JSON.stringify({ data }))
  } catch (_) {}
}

function buildOrderSig(packs) {
  return (packs || [])
    .map((p) => {
      const payload = p && p.payload ? p.payload : p
      return `${String(payload.id || '')}:${String(payload.updatedAt || payload.publishedAt || '')}`
    })
    .sort()
    .join('|')
    .slice(0, 220)
}

function buildMatchCacheKey(board, matchOrderId, orderSig) {
  return `${board || 'talent'}:${matchOrderId || 'recent'}:${orderSig || ''}`.slice(0, 280)
}

function readEnrichedRows(cacheKey) {
  const store = readStore()
  const hit = store[cacheKey]
  return Array.isArray(hit) ? hit : null
}

function writeEnrichedRows(cacheKey, rows) {
  const store = readStore()
  store[cacheKey] = rows
  writeStore(store)
}

module.exports = {
  buildOrderSig,
  buildMatchCacheKey,
  readEnrichedRows,
  writeEnrichedRows,
}
