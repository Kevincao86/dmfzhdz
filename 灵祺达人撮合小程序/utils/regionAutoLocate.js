/**
 * 注册/资料页：自动定位省市（可选模糊定位 + ECS 逆地理，默认 IP 兜底）
 */
const ecs = require('./ecs.js')
const china = require('./chinaRegion.js')
const config = require('./config.js')

function fuzzyLocationEnabled() {
  return config.MP_USE_FUZZY_LOCATION === true
}

const SKIP_FUZZY_KEY = 'mp_fuzzy_location_skip'

function isFuzzyLocationBlocked(err) {
  const msg = String((err && err.errMsg) || err || '')
  return /80424|not authorized|getFuzzyLocation/i.test(msg)
}

function readSkipFuzzyFlag() {
  try {
    return !!wx.getStorageSync(SKIP_FUZZY_KEY)
  } catch (_) {
    return false
  }
}

function markFuzzyLocationBlocked() {
  try {
    wx.setStorageSync(SKIP_FUZZY_KEY, 1)
  } catch (_) {}
}

function ensurePrivacyAuthorize() {
  return new Promise((resolve) => {
    if (typeof wx.requirePrivacyAuthorize !== 'function') {
      resolve(true)
      return
    }
    wx.requirePrivacyAuthorize({
      success: () => resolve(true),
      fail: () => resolve(false),
    })
  })
}

function readDeviceLocation() {
  if (!fuzzyLocationEnabled()) {
    return Promise.reject(new Error('fuzzy_location_disabled'))
  }
  if (readSkipFuzzyFlag()) {
    return Promise.reject(new Error('fuzzy_location_blocked'))
  }
  if (typeof wx.getFuzzyLocation !== 'function') {
    return Promise.reject(new Error('no_fuzzy_location_api'))
  }
  return ensurePrivacyAuthorize().then((ok) => {
    if (!ok) return Promise.reject(new Error('privacy_denied'))
    return new Promise((resolve, reject) => {
      wx.getFuzzyLocation({
        type: 'gcj02',
        success(res) {
          const lat = Number(res && res.latitude)
          const lng = Number(res && res.longitude)
          if (Number.isFinite(lat) && Number.isFinite(lng)) resolve({ lat, lng })
          else reject(new Error('invalid_coords'))
        },
        fail(err) {
          if (isFuzzyLocationBlocked(err)) markFuzzyLocationBlocked()
          reject(err || new Error('location_denied'))
        },
      })
    })
  })
}

function requestRegionFromServer(coords) {
  const lat = coords && Number.isFinite(coords.lat) ? coords.lat : null
  const lng = coords && Number.isFinite(coords.lng) ? coords.lng : null
  const qs =
    lat != null && lng != null
      ? `?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
      : ''
  return ecs.get(`/api/meoo-mp-region-locate${qs}`)
}

function normalizeServerRegion(data) {
  const rawProvince = String((data && (data.province || data.pro)) || '').trim()
  const rawCity = String((data && (data.city || data.cityName)) || '').trim()
  const hit = china.resolveRegionNames(rawProvince, rawCity)
  if (hit) return hit
  return null
}

/** @returns {Promise<{province:string,city:string,source:string}|null>} */
function autoLocateRegion(opts) {
  const skipDevice = !!(opts && opts.skipDevice) || !fuzzyLocationEnabled()
  const locatePromise = skipDevice
    ? Promise.resolve(null)
    : readDeviceLocation().catch(() => null)

  return locatePromise
    .then((coords) => requestRegionFromServer(coords))
    .then((data) => {
      if (!data || data.ok === false) return null
      const hit = normalizeServerRegion(data)
      if (!hit) return null
      return {
        province: hit.province,
        city: hit.city,
        source: String(data.source || 'server').trim() || 'server',
      }
    })
    .catch(() => null)
}

module.exports = {
  autoLocateRegion,
  readDeviceLocation,
  normalizeServerRegion,
  fuzzyLocationEnabled,
}
