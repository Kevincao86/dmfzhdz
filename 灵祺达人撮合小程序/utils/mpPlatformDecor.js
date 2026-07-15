const ecs = require('./ecs.js')

const STORAGE_PREFIX = 'mp_platform_decor_v1_'

function storageKey(itemId) {
  return STORAGE_PREFIX + String(itemId || '')
}

function todayKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function readDismissState(itemId) {
  try {
    return wx.getStorageSync(storageKey(itemId)) || null
  } catch (_) {
    return null
  }
}

function writeDismissState(itemId, state) {
  try {
    wx.setStorageSync(storageKey(itemId), state)
  } catch (_) {
    /* ignore */
  }
}

function shouldShowByFreq(item) {
  if (!item || !item.id) return false
  const freq = String(item.freq || 'daily')
  if (freq === 'always') return true
  const st = readDismissState(item.id)
  if (!st) return true
  if (freq === 'once' && st.dismissed) return false
  if (freq === 'daily' && st.day === todayKey()) return false
  return true
}

function dismissItem(item) {
  if (!item || !item.id) return
  const freq = String(item.freq || 'daily')
  if (freq === 'always') return
  writeDismissState(item.id, {
    dismissed: true,
    day: todayKey(),
    at: Date.now(),
  })
}

async function fetchDecorItem(slotKey, identity) {
  const key = String(slotKey || '').trim()
  if (!key) return null
  let path = `/api/meoo-platform-decor-public?slotKey=${encodeURIComponent(key)}`
  if (identity) path += `&identity=${encodeURIComponent(identity)}`
  try {
    const data = await ecs.get(path)
    if (!data || data.ok === false) return null
    return data.item || null
  } catch (_) {
    return null
  }
}

function openDecorLink(item) {
  if (!item) return
  const type = String(item.linkType || 'none')
  const val = String(item.linkValue || '').trim()
  if (type === 'none' || !val) return
  if (type === 'mp_path') {
    const url = val.startsWith('/') ? val : `/${val}`
    wx.navigateTo({
      url,
      fail: () => {
        wx.switchTab({ url, fail: () => {} })
      },
    })
    return
  }
  if (type === 'web_url') {
    const enc = encodeURIComponent(val)
    wx.navigateTo({
      url: `/pages/web-link/web-link?url=${enc}`,
      fail: () => {
        wx.setClipboardData({ data: val })
      },
    })
  }
}

function isDecorVideoMedia(item) {
  if (!item) return false
  if (String(item.mediaType || '').toLowerCase() === 'video') return true
  if (String(item.mediaType || '').toLowerCase() === 'image') return false
  const u = String(item.imageUrl || '')
    .trim()
    .toLowerCase()
    .split(/[?#]/)[0]
  return /\.(mp4|webm|mov|m4v)$/.test(u)
}

/** 拉取后补齐 isVideo，便于 wxml 判断 */
async function fetchDecorItemWithMeta(slotKey, identity) {
  const item = await fetchDecorItem(slotKey, identity)
  if (!item || !item.imageUrl) return null
  return { ...item, isVideo: isDecorVideoMedia(item) }
}

module.exports = {
  fetchDecorItem,
  fetchDecorItemWithMeta,
  shouldShowByFreq,
  dismissItem,
  openDecorLink,
  isDecorVideoMedia,
}
