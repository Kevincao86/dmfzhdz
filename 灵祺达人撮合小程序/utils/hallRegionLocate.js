/**
 * 大厅省/市默认筛选：GPS/模糊定位优先 → IP 兜底；用户手动选择写入本地偏好。
 */
const config = require('./config.js')
const api = require('./api.js')
const ecs = require('./ecs.js')
const china = require('./chinaRegion.js')

const STORAGE_KEY = 'hall_region_filter_v1'

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

function getFuzzyLatLng() {
  return new Promise((resolve) => {
    const done = (lat, lng) => {
      if (lat == null || lng == null) {
        resolve(null)
        return
      }
      resolve({ lat, lng })
    }
    if (typeof wx.getFuzzyLocation === 'function') {
      wx.getFuzzyLocation({
        type: 'wgs84',
        success(res) {
          done(Number(res.latitude), Number(res.longitude))
        },
        fail() {
          done(null, null)
        },
      })
      return
    }
    if (typeof wx.getLocation === 'function') {
      wx.getLocation({
        type: 'wgs84',
        success(res) {
          done(Number(res.latitude), Number(res.longitude))
        },
        fail() {
          done(null, null)
        },
      })
      return
    }
    done(null, null)
  })
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
      const coords = await getFuzzyLatLng()
      if (coords) {
        const hit = await fetchLocate(coords.lat, coords.lng)
        if (hit) return hit
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
