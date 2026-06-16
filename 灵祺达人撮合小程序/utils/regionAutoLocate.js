/**
 * 注册/资料页：真机优先 wx.getFuzzyLocation + ECS 逆地理；IP 兜底仅开发者工具
 */
const ecs = require('./ecs.js')
const cloudEcs = require('./cloudEcs.js')
const china = require('./chinaRegion.js')
const config = require('./config.js')

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

const SKIP_FUZZY_KEY = 'mp_fuzzy_location_skip'

function isFuzzyLocationBlocked(err) {
  const code = Number(err && err.errCode)
  if (code === 80424) return true
  const msg = String((err && err.errMsg) || err || '')
  return /80424|getFuzzyLocation:fail.*not authorized|接口未开通/i.test(msg)
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

function ensureFuzzyScopeAuthorized() {
  return new Promise((resolve, reject) => {
    wx.getSetting({
      success(res) {
        const auth = (res && res.authSetting) || {}
        if (auth['scope.userFuzzyLocation'] === true) {
          resolve()
          return
        }
        if (auth['scope.userFuzzyLocation'] === false) {
          reject(new Error('scope_denied'))
          return
        }
        wx.authorize({
          scope: 'scope.userFuzzyLocation',
          success: () => resolve(),
          fail: (err) => reject(err || new Error('scope_denied')),
        })
      },
      fail: () => resolve(),
    })
  })
}

function readDeviceLocation() {
  if (!fuzzyLocationEnabled()) {
    return Promise.reject(new Error('fuzzy_location_unavailable'))
  }
  if (typeof wx.getFuzzyLocation !== 'function') {
    return Promise.reject(new Error('no_fuzzy_location_api'))
  }
  return ensureFuzzyScopeAuthorized().then(
    () =>
      new Promise((resolve, reject) => {
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
      }),
  )
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
      return requestRegionFromServer(coords).then((data) => data)
    })
    .then((data) => {
      if (!data) return null
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
  canUseFuzzyLocation,
  ipLocateEnabled,
  clearFuzzyLocationBlocked,
  isFuzzyLocationBlocked,
  readSkipFuzzyFlag,
}
