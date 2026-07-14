const STORAGE_KEY = 'meoo.pendingDistributionRef'
const TTL_MS = 30 * 24 * 60 * 60 * 1000

function readPayload() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    if (!raw || typeof raw !== 'object') return null
    const refCode = String(raw.refCode || '').trim()
    const savedAt = Number(raw.savedAt)
    if (!refCode || !Number.isFinite(savedAt)) return null
    if (Date.now() - savedAt > TTL_MS) {
      wx.removeStorageSync(STORAGE_KEY)
      return null
    }
    return { refCode, savedAt }
  } catch (_) {
    return null
  }
}

function saveRef(refCode) {
  const code = String(refCode || '').trim()
  if (!code) return
  try {
    wx.setStorageSync(STORAGE_KEY, { refCode: code, savedAt: Date.now() })
  } catch (_) {
    /* ignore */
  }
}

function readRef() {
  return readPayload()?.refCode || ''
}

function clearRef() {
  try {
    wx.removeStorageSync(STORAGE_KEY)
  } catch (_) {
    /* ignore */
  }
}

function captureFromOptions(options) {
  const ref = String((options && options.ref) || '').trim()
  if (ref) saveRef(ref)
  return ref || readRef()
}

module.exports = {
  saveRef,
  readRef,
  clearRef,
  captureFromOptions,
}
