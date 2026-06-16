/**
 * 注册/资料页：真机 wx.getFuzzyLocation + ECS 逆地理；IP 兜底仅开发者工具
 */
const ecs = require('./ecs.js')
const cloudEcs = require('./cloudEcs.js')
const china = require('./chinaRegion.js')
const nearestCity = require('./chinaNearestCity.js')
const config = require('./config.js')

const SKIP_FUZZY_KEY = 'mp_fuzzy_location_skip'
const PENDING_HIT_KEY = 'mp_fuzzy_loc_pending_hit'
const PROFILE_LOCATE_FLAG_KEY = 'mp_profile_locate_on_enter'

let lastLocateFailReason = ''

function fuzzyLocationEnabled() {
  return config.MP_USE_FUZZY_LOCATION === true
}

function ipLocateEnabled() {
  if (config.MP_IP_LOCATE_ENABLED === true) return true
  if (config.MP_IP_LOCATE_ENABLED === false) {
    try {
      const mpRuntime = require('./mpRuntime.js')
      if (mpRuntime.isDevtoolsEnv()) return true
    } catch (_) {}
    return false
  }
  try {
    const mpRuntime = require('./mpRuntime.js')
    if (mpRuntime.isPhoneRuntime()) return false
  } catch (_) {}
  return true
}

function isFuzzyLocationBlocked(err) {
  const code = Number(err && err.errCode)
  if (code === 80424) return true
  const msg = String((err && err.errMsg) || err || '')
  return /\b80424\b/.test(msg)
}

function classifyLocateError(err) {
  const code = Number(err && err.errCode)
  const msg = String((err && err.errMsg) || err || '')
  if (code === 80424 || /\b80424\b/.test(msg)) return 'api_blocked'
  if (
    /getFuzzyLocation:fail auth deny|getFuzzyLocation:fail.*user deny|getFuzzyLocation:fail.*not authorized|scope\.userFuzzyLocation|auth deny|permission denied|拒绝/i.test(
      msg,
    )
  ) {
    return 'scope_denied'
  }
  return 'location_fail'
}

function isScopeDenied(err) {
  return classifyLocateError(err) === 'scope_denied'
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

function clearFuzzyLocationBlocked() {
  try {
    wx.removeStorageSync(SKIP_FUZZY_KEY)
  } catch (_) {}
}

function canUseFuzzyLocation() {
  return fuzzyLocationEnabled() && !readSkipFuzzyFlag()
}

function readLastLocateFailReason() {
  return String(lastLocateFailReason || '').trim()
}

function readFuzzyScopeSetting() {
  return new Promise((resolve) => {
    wx.getSetting({
      success(res) {
        const v = res && res.authSetting && res.authSetting['scope.userFuzzyLocation']
        if (v === true || v === false) resolve(v)
        else resolve(undefined)
      },
      fail: () => resolve(undefined),
    })
  })
}

function markProfileLocateOnEnter() {
  try {
    wx.setStorageSync(PROFILE_LOCATE_FLAG_KEY, 1)
  } catch (_) {}
}

function consumeProfileLocateOnEnter() {
  try {
    const v = wx.getStorageSync(PROFILE_LOCATE_FLAG_KEY)
    wx.removeStorageSync(PROFILE_LOCATE_FLAG_KEY)
    return !!v
  } catch (_) {
    return false
  }
}

function cacheLocateHit(hit) {
  if (!hit || !hit.province || !hit.city) return
  try {
    wx.setStorageSync(PENDING_HIT_KEY, {
      province: hit.province,
      city: hit.city,
      source: hit.source || 'gps',
    })
  } catch (_) {}
}

function consumePendingHit() {
  try {
    const raw = wx.getStorageSync(PENDING_HIT_KEY)
    wx.removeStorageSync(PENDING_HIT_KEY)
    if (raw && raw.province && raw.city) return raw
  } catch (_) {}
  return null
}

function invokeGetFuzzyLocation() {
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
}

function tryAuthorizeFuzzyScope() {
  return new Promise((resolve) => {
    if (typeof wx.authorize !== 'function') {
      resolve()
      return
    }
    wx.authorize({
      scope: 'scope.userFuzzyLocation',
      success: () => resolve(),
      fail: () => resolve(),
    })
  })
}

function ensurePrivacyReady() {
  return new Promise((resolve) => {
    if (typeof wx.getPrivacySetting !== 'function') {
      resolve()
      return
    }
    wx.getPrivacySetting({
      success(res) {
        if (!res || !res.needAuthorization) {
          resolve()
          return
        }
        if (typeof wx.requirePrivacyAuthorize === 'function') {
          wx.requirePrivacyAuthorize({ success: () => resolve(), fail: () => resolve() })
          return
        }
        resolve()
      },
      fail: () => resolve(),
    })
  })
}

function readDeviceLocation() {
  lastLocateFailReason = ''
  if (!fuzzyLocationEnabled()) {
    lastLocateFailReason = 'fuzzy_disabled'
    return Promise.reject(new Error('fuzzy_location_unavailable'))
  }
  if (typeof wx.getFuzzyLocation !== 'function') {
    lastLocateFailReason = 'no_api'
    return Promise.reject(new Error('no_fuzzy_location_api'))
  }

  return ensurePrivacyReady()
    .then(() => tryAuthorizeFuzzyScope())
    .then(() => invokeGetFuzzyLocation())
    .catch((err) => {
      lastLocateFailReason = classifyLocateError(err)
      throw err
    })
}

function requestRegionFromServer(coords) {
  const lat = coords && Number.isFinite(coords.lat) ? coords.lat : null
  const lng = coords && Number.isFinite(coords.lng) ? coords.lng : null
  const hasCoords = lat != null && lng != null
  if (!hasCoords && !ipLocateEnabled()) {
    return Promise.resolve({ ok: false, message: 'coords_required' })
  }
  const qs = hasCoords
    ? `?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
    : ''
  const path = `/api/meoo-mp-region-locate${qs}`
  const mpRuntime = require('./mpRuntime.js')
  if (cloudEcs.cloudEnvReady() && mpRuntime.isPhoneRuntime()) {
    return cloudEcs.getForce(path)
  }
  if (cloudEcs.cloudEnvReady() && !mpRuntime.shouldForceDirect(config)) {
    return cloudEcs.getForce(path).catch(() => ecs.get(path))
  }
  return ecs.get(path)
}

function normalizeServerRegion(data) {
  const rawProvince = String((data && (data.province || data.pro)) || '').trim()
  const rawCity = String((data && (data.city || data.cityName)) || '').trim()
  const hit = china.resolveRegionNames(rawProvince, rawCity)
  if (hit) return hit
  return null
}

function coordsToRegion(coords) {
  const lat = coords && coords.lat
  const lng = coords && coords.lng
  const local = nearestCity.resolveNearestCity(lat, lng)
  if (local) {
    const hit = china.resolveRegionNames(local.province, local.city)
    if (hit) {
      lastLocateFailReason = ''
      return Promise.resolve({
        province: hit.province,
        city: hit.city,
        source: 'gps',
      })
    }
  }
  return requestRegionFromServer(coords).then((data) => {
    if (!data || data.ok === false) {
      lastLocateFailReason = 'geocode_fail'
      return null
    }
    const hit = normalizeServerRegion(data)
    if (!hit) {
      lastLocateFailReason = 'geocode_fail'
      return null
    }
    lastLocateFailReason = ''
    return {
      province: hit.province,
      city: hit.city,
      source: String(data.source || 'gps').trim() || 'gps',
    }
  })
}

function fetchFuzzyRegion() {
  return readDeviceLocation()
    .then((coords) => coordsToRegion(coords))
    .catch(() => null)
}

/**
 * @param {{fromUserTap?:boolean, forceRetry?:boolean}} opts
 * fromUserTap/forceRetry：始终调 getFuzzyLocation（弹出系统授权或静默取坐标）
 */
function requestFuzzyLocationOnProfileEnter(opts) {
  if (!fuzzyLocationEnabled()) return Promise.resolve(null)
  const fromUserTap = !!(opts && opts.fromUserTap)
  const forceRetry = !!(opts && opts.forceRetry)

  if (fromUserTap || forceRetry) {
    return fetchFuzzyRegion()
  }

  return readFuzzyScopeSetting().then((scope) => {
    if (scope === true) return fetchFuzzyRegion()
    return null
  })
}

function autoLocateRegion(opts) {
  const forceFuzzy = !!(opts && opts.forceFuzzy)
  const tryFuzzy =
    !!(opts && opts.tryFuzzy) &&
    fuzzyLocationEnabled() &&
    (forceFuzzy || !readSkipFuzzyFlag())
  const skipDevice = !!(opts && opts.skipDevice) || !tryFuzzy
  if (!tryFuzzy && !ipLocateEnabled()) return Promise.resolve(null)
  const locatePromise = skipDevice ? Promise.resolve(null) : readDeviceLocation().catch(() => null)
  return locatePromise
    .then((coords) => {
      const hasCoords = coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
      if (!hasCoords && (tryFuzzy || !ipLocateEnabled())) return null
      return coordsToRegion(coords)
    })
    .catch(() => null)
}

function openFuzzyLocationSetting() {
  if (typeof wx.openSetting !== 'function') return
  wx.openSetting({})
}

module.exports = {
  autoLocateRegion,
  readDeviceLocation,
  requestFuzzyLocationOnProfileEnter,
  normalizeServerRegion,
  fuzzyLocationEnabled,
  canUseFuzzyLocation,
  ipLocateEnabled,
  clearFuzzyLocationBlocked,
  isFuzzyLocationBlocked,
  isScopeDenied,
  readSkipFuzzyFlag,
  readLastLocateFailReason,
  readFuzzyScopeSetting,
  openFuzzyLocationSetting,
  markProfileLocateOnEnter,
  consumeProfileLocateOnEnter,
  cacheLocateHit,
  consumePendingHit,
}
