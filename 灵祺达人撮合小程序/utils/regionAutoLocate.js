/**
 * 注册/资料页：自动定位省市（模糊定位 + ECS 逆地理，失败时 IP 兜底）
 */
const ecs = require('./ecs.js')
const china = require('./chinaRegion.js')

function readDeviceLocation() {
  return new Promise((resolve, reject) => {
    const onOk = (res) => {
      const lat = Number(res && res.latitude)
      const lng = Number(res && res.longitude)
      if (Number.isFinite(lat) && Number.isFinite(lng)) resolve({ lat, lng })
      else reject(new Error('invalid_coords'))
    }
    if (typeof wx.getFuzzyLocation !== 'function') {
      reject(new Error('no_fuzzy_location_api'))
      return
    }
    wx.getFuzzyLocation({
      type: 'gcj02',
      success: onOk,
      fail: (err) => reject(err || new Error('location_denied')),
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
  const skipDevice = !!(opts && opts.skipDevice)
  const locatePromise = skipDevice
    ? Promise.reject(new Error('skip_device'))
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
}
