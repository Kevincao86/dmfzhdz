/**
 * 商品列表本地草稿库 — 键名与网页 productEditLibrary.ts 一致。
 * 助手「保存至草稿」写入后，商品列表按平台 Tab 合并展示。
 */
const sessionSync = require('./merchantSessionSyncMp.js')

const BASE_KEY = 'meoo_product_edit_library_v1'

function libraryStorageKey() {
  let tid = ''
  try {
    tid = String(wx.getStorageSync(sessionSync.MEOO_ACTIVE_TENANT_ID) || '').trim()
  } catch (_) {}
  return tid ? `${BASE_KEY}@${tid}` : BASE_KEY
}

function loadProductEditLibrary() {
  try {
    const raw = wx.getStorageSync(libraryStorageKey())
    const arr = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : []
    if (!Array.isArray(arr)) return []
    const out = []
    for (const x of arr) {
      if (!x || typeof x !== 'object') continue
      const id = String(x.id || '').trim()
      const name = String(x.name || '').trim()
      if (!id || !name) continue
      const price = Number(x.price)
      out.push({
        id,
        name,
        platform: String(x.platform || '抖音来客').trim() || '抖音来客',
        store: String(x.store || '—').trim() || '—',
        status: String(x.status || '草稿').trim() || '草稿',
        price: Number.isFinite(price) ? price : 0,
        platformApi: x.platformApi ? String(x.platformApi) : '',
      })
    }
    return out
  } catch (_) {
    return []
  }
}

function persist(rows) {
  try {
    wx.setStorageSync(libraryStorageKey(), JSON.stringify(rows))
  } catch (_) {}
}

function upsertProductEditLibraryDraft(row) {
  const id = String(row.id || '').trim()
  const name = String(row.name || '').trim()
  if (!id || !name) return false
  const prev = loadProductEditLibrary()
  const nextRow = {
    id,
    name,
    platform: String(row.platform || '抖音来客'),
    store: String(row.store || '—'),
    status: String(row.status || '草稿'),
    price: Number.isFinite(Number(row.price)) ? Number(row.price) : 0,
    platformApi: row.platformApi ? String(row.platformApi) : '',
  }
  const idx = prev.findIndex((p) => p.id === id)
  const next = idx >= 0 ? prev.slice() : [nextRow, ...prev]
  if (idx >= 0) next[idx] = Object.assign({}, prev[idx], nextRow)
  persist(next)
  return true
}

module.exports = {
  BASE_KEY,
  loadProductEditLibrary,
  upsertProductEditLibraryDraft,
}
