const sessionStore = require('./mpSessionStore.js')
const scope = require('./mpAccountLocalScope.js')

const KEY_BASE = 'meoo_order_favorites_v1'

function storageKey() {
  const account = sessionStore.readAccount()
  if (!account) return ''
  return scope.scopedStorageKey(KEY_BASE, account)
}

function readIdSet() {
  const key = storageKey()
  if (!key) return new Set()
  try {
    const raw = wx.getStorageSync(key)
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    return new Set((Array.isArray(arr) ? arr : []).map(String))
  } catch {
    return new Set()
  }
}

function writeIdSet(set) {
  const key = storageKey()
  if (!key) return
  wx.setStorageSync(key, JSON.stringify([...set].slice(0, 200)))
  try {
    require('./mpAccountClientSync.js').schedulePush()
  } catch (_) {}
}

function isFavorite(orderId) {
  return readIdSet().has(String(orderId))
}

function toggleFavorite(orderId) {
  const id = String(orderId || '')
  if (!id || id === 'mock-preview') return false
  const set = readIdSet()
  if (set.has(id)) set.delete(id)
  else set.add(id)
  writeIdSet(set)
  return set.has(id)
}

function applyFavoriteIdsFromSync(ids) {
  if (!Array.isArray(ids)) return
  const key = storageKey()
  if (!key) return
  wx.setStorageSync(key, JSON.stringify([...new Set(ids.map(String))].slice(0, 200)))
}

module.exports = {
  readIdSet,
  isFavorite,
  toggleFavorite,
  applyFavoriteIdsFromSync,
}
