/**
 * 资料页定位：wx.getFuzzyLocation 模拟定位 + 本地区县逆地理
 */
const ecs = require('./ecs.js')
const cloudEcs = require('./cloudEcs.js')
const china = require('./chinaRegion.js')
const nearestCity = require('./chinaNearestCity.js')
const config = require('./config.js')

const SKIP_LOCATE_KEY = 'mp_fuzzy_location_skip'
const PENDING_HIT_KEY = 'mp_fuzzy_loc_pending_hit'
const PROFILE_LOCATE_FLAG_KEY = 'mp_profile_locate_on_enter'

let lastLocateFailReason = ''

function useGetLocation() {
  return config.MP_USE_DEVICE_LOCATION === true
}

function locationApiEnabled() {
  if (config.MP_USE_DEVICE_LOCATION === true) return true
  if (config.MP_USE_FUZZY_LOCATION === true) return true
  return false
}

function fuzzyLocationEnabled() {
  return locationApiEnabled()
}

function locationScopeKey() {
  return useGetLocation() ? 'scope.userLocation' : 'scope.userFuzzyLocation'
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

function isLocationApiBlocked(err) {
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
    /get(?:Fuzzy)?Location:fail auth deny|get(?:Fuzzy)?Location:fail.*user deny|get(?:Fuzzy)?Location:fail.*not authorized|scope\.user(?:Fuzzy)?Location|auth deny|permission denied|拒绝/i.test(
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

function readSkipLocateFlag() {
  try {
    return !!wx.getStorageSync(SKIP_LOCATE_KEY)
  } catch (_) {
    return false
  }
}

function markLocationApiBlocked() {
  try {
    wx.setStorageSync(SKIP_LOCATE_KEY, 1)
  } catch (_) {}
}

function clearFuzzyLocationBlocked() {
  try {
    wx.removeStorageSync(SKIP_LOCATE_KEY)
  } catch (_) {}
}

function canUseFuzzyLocation() {
  return locationApiEnabled() && !readSkipLocateFlag()
}

function readLastLocateFailReason() {
  return String(lastLocateFailReason || '').trim()
}

function readLocationScopeSetting() {
  const key = locationScopeKey()
  return new Promise((resolve) => {
    wx.getSetting({
      success(res) {
        const v = res && res.authSetting && res.authSetting[key]
        if (v === true || v === false) resolve(v)
        else resolve(undefined)
      },
      fail: () => resolve(undefined),
    })
  })
}

function readFuzzyScopeSetting() {
  return readLocationScopeSetting()
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

function invokeGetLocation() {
  return new Promise((resolve, reject) => {
    wx.getLocation({
      type: 'gcj02',
      success(res) {
        const lat = Number(res && res.latitude)
        const lng = Number(res && res.longitude)
        if (Number.isFinite(lat) && Number.isFinite(lng)) resolve({ lat, lng })
        else reject(new Error('invalid_coords'))
      },
      fail(err) {
        reject(err || new Error('location_denied'))
      },
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
        if (isLocationApiBlocked(err)) markLocationApiBlocked()
        reject(err || new Error('location_denied'))
      },
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
  if (!locationApiEnabled()) {
    lastLocateFailReason = 'location_disabled'
    return Promise.reject(new Error('location_unavailable'))
  }

  const usePrecise = useGetLocation()
  if (usePrecise && typeof wx.getLocation !== 'function') {
    lastLocateFailReason = 'no_api'
    return Promise.reject(new Error('no_location_api'))
  }
  if (!usePrecise && typeof wx.getFuzzyLocation !== 'function') {
    lastLocateFailReason = 'no_api'
    return Promise.reject(new Error('no_fuzzy_location_api'))
  }

  const invoke = usePrecise ? invokeGetLocation : invokeGetFuzzyLocation
  return ensurePrivacyReady()
    .then(() => invoke())
    .catch((err) => {
      if (!usePrecise && isLocationApiBlocked(err)) markLocationApiBlocked()
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

function fetchDeviceRegion() {
  return readDeviceLocation()
    .then((coords) => coordsToRegion(coords))
    .catch(() => null)
}

/**
 * @param {{fromUserTap?:boolean, forceRetry?:boolean}} opts
 * 用户点击「重新定位」时直接调 getLocation，弹出微信原生位置授权
 */
function requestFuzzyLocationOnProfileEnter(opts) {
  if (!locationApiEnabled()) return Promise.resolve(null)
  const fromUserTap = !!(opts && opts.fromUserTap)
  const forceRetry = !!(opts && opts.forceRetry)

  if (fromUserTap || forceRetry) {
    return fetchDeviceRegion()
  }

  return readLocationScopeSetting().then((scope) => {
    if (scope === true) return fetchDeviceRegion()
    return null
  })
}

function autoLocateRegion(opts) {
  const forceFuzzy = !!(opts && opts.forceFuzzy)
  const tryFuzzy =
    !!(opts && opts.tryFuzzy) &&
    locationApiEnabled() &&
    (forceFuzzy || !readSkipLocateFlag())
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

function openLocationSetting() {
  if (typeof wx.openSetting !== 'function') return
  wx.openSetting({})
}

function openFuzzyLocationSetting() {
  openLocationSetting()
}

/** 仅在用户曾明确拒绝授权时引导 openSetting（设置页有「位置信息」开关） */
function promptLocationDeniedIfNeeded(opts) {
  const manual = !!(opts && opts.manual)
  if (!manual) return Promise.resolve(false)
  if (readLastLocateFailReason() !== 'scope_denied') return Promise.resolve(false)

  return readLocationScopeSetting().then((scope) => {
    if (scope === false) {
      wx.showModal({
        title: '需要位置权限',
        content: '您已拒绝位置授权。请在设置中开启「位置信息」，以便自动填写所在省市',
        confirmText: '去设置',
        cancelText: '手动选择',
        success(res) {
          if (res.confirm) openLocationSetting()
        },
      })
      return true
    }
    wx.showToast({
      title: '请点击「重新定位」并在弹窗中允许位置权限',
      icon: 'none',
      duration: 2800,
    })
    return true
  })
}

function locateFailToastTitle(reason) {
  const mpRuntime = require('./mpRuntime.js')
  if (reason === 'api_blocked') {
    return useGetLocation()
      ? '请确认已开通 getLocation 并重新上传体验版'
      : '请重新上传体验版（含 getFuzzyLocation 声明）'
  }
  if (reason === 'no_api') return '当前微信版本不支持定位'
  if (reason === 'geocode_fail') return '定位解析失败，请手动选择'
  if (reason === 'scope_denied') return '请允许位置权限'
  if (mpRuntime.isDevtoolsEnv()) return '开发者工具请手动选择省市'
  return '定位失败，请重试'
}

module.exports = {
  autoLocateRegion,
  readDeviceLocation,
  requestFuzzyLocationOnProfileEnter,
  normalizeServerRegion,
  locationApiEnabled,
  fuzzyLocationEnabled,
  useGetLocation,
  canUseFuzzyLocation,
  ipLocateEnabled,
  clearFuzzyLocationBlocked,
  isFuzzyLocationBlocked: isLocationApiBlocked,
  isScopeDenied,
  readSkipFuzzyFlag: readSkipLocateFlag,
  readLastLocateFailReason,
  readLocationScopeSetting,
  readFuzzyScopeSetting,
  openLocationSetting,
  openFuzzyLocationSetting,
  markProfileLocateOnEnter,
  consumeProfileLocateOnEnter,
  cacheLocateHit,
  consumePendingHit,
  promptLocationDeniedIfNeeded,
  locateFailToastTitle,
}
