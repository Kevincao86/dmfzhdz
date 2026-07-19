/**
 * 大厅省/市默认筛选：模糊定位优先 → IP 兜底；用户手动选择写入本地偏好。
 *
 * 真机注意：未同意隐私时 getFuzzyLocation 可能一直不回调（开发者工具常直接成功）。
 * 须超时 + 隐私未授权时跳过 GPS，保证 IP 兜底能跑到。
 */
const config = require('./config.js')
const api = require('./api.js')
const ecs = require('./ecs.js')
const china = require('./chinaRegion.js')
const nearestCity = require('./chinaNearestCity.js')

const STORAGE_KEY = 'hall_region_filter_v1'
const FUZZY_TIMEOUT_MS = 3500

function readStoredFilter() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    if (!raw || typeof raw !== 'object') return null
    const province = String(raw.province || '').trim()
    const city = String(raw.city || '').trim()
    if (!province && !city) return null
    const resolved = china.resolveRegionNames(province, city)
    if (resolved) return { province: resolved.province, city: resolved.city, source: 'stored' }
    return { province: province || '全部', city: city || '全部', source: 'stored' }
  } catch (_) {
    return null
  }
}

function writeStoredFilter(province, city) {
  try {
    wx.setStorageSync(STORAGE_KEY, {
      province: String(province || '全部'),
      city: String(city || '全部'),
      at: Date.now(),
    })
  } catch (_) {}
}

function clearStoredFilter() {
  try {
    wx.removeStorageSync(STORAGE_KEY)
  } catch (_) {}
}

function locateApiPath(lat, lng) {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `/api/meoo-mp-region-locate?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
  }
  return '/api/meoo-mp-region-locate'
}

async function fetchLocate(lat, lng) {
  const path = locateApiPath(lat, lng)
  const getter = typeof ecs.get === 'function' ? ecs.get.bind(ecs) : null
  const data = getter
    ? await getter(path).catch(() => api.get(path))
    : await api.get(path)
  if (!data || data.ok === false) return null
  const province = String(data.province || '').trim()
  const city = String(data.city || '').trim()
  if (!province && !city) return null
  const resolved = china.resolveRegionNames(province, city)
  if (resolved) {
    return { province: resolved.province, city: resolved.city, source: data.source || 'api' }
  }
  return { province: province || '全部', city: city || '全部', source: data.source || 'api' }
}

/** 隐私尚未同意时勿调 getFuzzyLocation，否则真机可能挂起不回调 */
function privacyAllowsFuzzyLocation() {
  return new Promise((resolve) => {
    if (typeof wx.getPrivacySetting !== 'function') {
      resolve(true)
      return
    }
    wx.getPrivacySetting({
      success(res) {
        resolve(!(res && res.needAuthorization))
      },
      fail() {
        resolve(true)
      },
    })
  })
}

function getFuzzyLatLng() {
  return new Promise((resolve) => {
    let settled = false
    const done = (lat, lng) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        resolve(null)
        return
      }
      resolve({ lat, lng })
    }
    const timer = setTimeout(() => done(null, null), FUZZY_TIMEOUT_MS)

    if (typeof wx.getFuzzyLocation !== 'function') {
      done(null, null)
      return
    }
    // 国内逆地理用 gcj02，与 chinaNearestCity 一致
    wx.getFuzzyLocation({
      type: 'gcj02',
      success(res) {
        done(Number(res.latitude), Number(res.longitude))
      },
      fail() {
        done(null, null)
      },
    })
  })
}

function resolveFromCoordsLocal(lat, lng) {
  try {
    const hit = nearestCity.resolveNearestCity(lat, lng)
    if (!hit) return null
    const resolved = china.resolveRegionNames(hit.province, hit.city)
    if (resolved) return { province: resolved.province, city: resolved.city, source: 'gps-local' }
    return { province: hit.province, city: hit.city, source: 'gps-local' }
  } catch (_) {
    return null
  }
}

/**
 * @returns {Promise<{ province: string, city: string, source: string } | null>}
 */
async function resolveHallRegionFilter() {
  const stored = readStoredFilter()
  if (stored && stored.province !== '全部') return stored

  const useFuzzy = config.MP_USE_FUZZY_LOCATION !== false
  const useIp = config.MP_IP_LOCATE_ENABLED !== false

  if (useFuzzy) {
    try {
      const allowFuzzy = await privacyAllowsFuzzyLocation()
      if (allowFuzzy) {
        const coords = await getFuzzyLatLng()
        if (coords) {
          const local = resolveFromCoordsLocal(coords.lat, coords.lng)
          if (local) return local
          const hit = await fetchLocate(coords.lat, coords.lng)
          if (hit) return hit
        }
      }
    } catch (_) {}
  }

  if (useIp) {
    try {
      const hit = await fetchLocate(null, null)
      if (hit) return hit
    } catch (_) {}
  }
  return null
}

module.exports = {
  STORAGE_KEY,
  readStoredFilter,
  writeStoredFilter,
  clearStoredFilter,
  resolveHallRegionFilter,
}
