/**
 * 门店电话/营业时间手填补充 — 键名与网页 storeContactOverride 一致。
 * 网页存在浏览器 localStorage，小程序存在 wx storage；同机不同端不能自动互通。
 */
const { MEOO_ACTIVE_TENANT_ID } = require('./merchantSessionSyncMp.js')

const BASE_KEY = 'meoo_store_contact_override_v1'

function tenantId() {
  try {
    return String(wx.getStorageSync(MEOO_ACTIVE_TENANT_ID) || '').trim()
  } catch (_) {
    return ''
  }
}

function storageKey() {
  const tid = tenantId()
  return tid ? `${BASE_KEY}@${tid}` : BASE_KEY
}

function entryKey(platform, poiId) {
  return `${String(platform || '').trim()}:${String(poiId || '').trim()}`
}

function loadAll() {
  try {
    let raw = wx.getStorageSync(storageKey())
    if (!raw) raw = wx.getStorageSync(BASE_KEY)
    if (typeof raw === 'string' && raw.trim()) raw = JSON.parse(raw)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return raw
  } catch (_) {
    return {}
  }
}

function saveAll(all) {
  try {
    wx.setStorageSync(storageKey(), all)
    wx.setStorageSync(BASE_KEY, all)
  } catch (_) {}
}

function getOverride(platform, poiId) {
  const all = loadAll()
  const row = all[entryKey(platform, poiId)]
  return row && typeof row === 'object' ? row : null
}

function saveOverride(platform, poiId, patch) {
  const id = String(poiId || '').trim()
  if (!id) return null
  const phone = String((patch && patch.phone) || '').trim()
  const businessHours = String((patch && patch.businessHours) || '').trim()
  const all = loadAll()
  const key = entryKey(platform, id)
  if (!phone && !businessHours) {
    delete all[key]
    saveAll(all)
    return null
  }
  const next = {
    ...(phone ? { phone } : {}),
    ...(businessHours ? { businessHours } : {}),
    updatedAt: new Date().toISOString(),
  }
  all[key] = next
  saveAll(all)
  return next
}

function applyToItem(item, platform) {
  if (!item) return item
  const o = getOverride(platform, item.id)
  if (!o) return item
  return {
    ...item,
    phone: item.phone || o.phone || '',
    businessHours: item.businessHours || o.businessHours || '',
    contactHint: o.phone || o.businessHours ? '已补充联系方式' : '',
  }
}

module.exports = { getOverride, saveOverride, applyToItem, entryKey }
