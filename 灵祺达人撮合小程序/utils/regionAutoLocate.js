/**
 * 注册/资料页：真机 wx.getFuzzyLocation + ECS 逆地理；IP 兜底仅开发者工具
 */
const ecs = require('./ecs.js')
const cloudEcs = require('./cloudEcs.js')
const china = require('./chinaRegion.js')
const config = require('./config.js')

const SKIP_FUZZY_KEY = 'mp_fuzzy_location_skip'
const AUTH_ASKED_KEY = 'mp_fuzzy_loc_auth_asked_v2'
const PENDING_HIT_KEY = 'mp_fuzzy_loc_pending_hit'
const NEED_AUTH_AFTER_LOGIN_KEY = 'mp_register_need_fuzzy_auth'

let lastLocateFailReason = ''

function fuzzyLocationEnabled() {
  return config.MP_USE_FUZZY_LOCATION === true
}

/** 备案期真机云代理下 IP 为机房出口，默认关闭；开发者工具直连 ECS 时可用 IP 兜底 */
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
  return /80424|getFuzzyLocation:fail.*not authorized|接口未开通/i.test(msg)
}

function isScopeDenied(err) {
  const msg = String((err && err.errMsg) || err || '')
  return /auth deny|authorize|permission denied|scope|denied|拒绝/i.test(msg)
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

function hasAuthAsked() {
  try {
    return !!wx.getStorageSync(AUTH_ASKED_KEY)
  } catch (_) {
    return false
  }
}

function markAuthAsked() {
  try {
    wx.setStorageSync(AUTH_ASKED_KEY, 1)
  } catch (_) {}
}

function markNeedFuzzyAuthAfterLogin() {
  try {
    wx.setStorageSync(NEED_AUTH_AFTER_LOGIN_KEY, 1)
  } catch (_) {}
}

function consumeNeedFuzzyAuthAfterLogin() {
  try {
    const v = wx.getStorageSync(NEED_AUTH_AFTER_LOGIN_KEY)
    wx.removeStorageSync(NEED_AUTH_AFTER_LOGIN_KEY)
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
        resolve((res && res.authSetting && res.authSetting['scope.userFuzzyLocation']) || undefined)
      },
      fail: () => resolve(undefined),
    })
  })
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
  const run = () =>
    invokeGetFuzzyLocation().catch((err) => {
      if (isScopeDenied(err)) lastLocateFailReason = 'scope_denied'
      else if (isFuzzyLocationBlocked(err)) lastLocateFailReason = 'api_blocked'
      else lastLocateFailReason = 'location_fail'
      throw err
    })

  if (typeof wx.requirePrivacyAuthorize !== 'function') return run()
  return new Promise((resolve, reject) => {
    wx.requirePrivacyAuthorize({
      success: () => run().then(resolve).catch(reject),
      fail: () => run().then(resolve).catch(reject),
    })
  })
}

function requestRegionFromServer(coords) {
  const lat = coords && Number.isFinite(coords.lat) ? coords.lat : null
  const lng = coords && Number.isFinite(coords.lng) ? coords.lng : null
  const hasCoords = lat != null && lng != null
  if (!hasCoords && !ipLocateEnabled()) {
    return Promise.resolve({ ok: false, message: 'coords_required' })
  }
  if (!hasCoords && !fuzzyLocationEnabled() && !ipLocateEnabled()) {
    return Promise.resolve({ ok: false, message: 'locate_disabled' })
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

/**
 * 进入「我的信息」时调用：已授权则静默定位；未授权且从未弹过则调 getFuzzyLocation 触发系统授权（仅一次）
 * @param {{fromUserTap?:boolean, forceRetry?:boolean}} opts
 */
function requestFuzzyLocationOnProfileEnter(opts) {
  if (!fuzzyLocationEnabled()) return Promise.resolve(null)
  const forceRetry = !!(opts && opts.forceRetry)

  return readFuzzyScopeSetting().then((scope) => {
    if (scope === true || forceRetry) {
      return readDeviceLocation()
        .then((coords) => coordsToRegion(coords))
        .catch(() => null)
    }
    if (scope === false) {
      if (!hasAuthAsked()) markAuthAsked()
      lastLocateFailReason = 'scope_denied'
      return null
    }
    if (hasAuthAsked()) {
      lastLocateFailReason = 'scope_denied'
      return null
    }
    markAuthAsked()
    return readDeviceLocation()
      .then((coords) => coordsToRegion(coords))
      .catch(() => null)
  })
}

/** @returns {Promise<{province:string,city:string,source:string}|null>} */
function autoLocateRegion(opts) {
  const forceFuzzy = !!(opts && opts.forceFuzzy)
  const tryFuzzy =
    !!(opts && opts.tryFuzzy) &&
    fuzzyLocationEnabled() &&
    (forceFuzzy || !readSkipFuzzyFlag())
  const skipDevice = !!(opts && opts.skipDevice) || !tryFuzzy
  if (!tryFuzzy && !ipLocateEnabled()) {
    return Promise.resolve(null)
  }
  const locatePromise = skipDevice
    ? Promise.resolve(null)
    : readDeviceLocation().catch(() => null)

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
  markNeedFuzzyAuthAfterLogin,
  consumeNeedFuzzyAuthAfterLogin,
  cacheLocateHit,
  consumePendingHit,
  hasAuthAsked,
}
