/**
 * 由 GCJ-02 坐标匹配最近地级市（模糊定位逆地理；区县库不打包，精度略降）
 */
const cityCenters = require('./chinaCityCenters.js')

const EXTRA = [
  { province: '广东省', city: '东莞市', lat: 23.0207, lng: 113.7518 },
  { province: '广东省', city: '中山市', lat: 22.5159, lng: 113.3926 },
  { province: '海南省', city: '三沙市', lat: 16.833, lng: 112.333 },
  { province: '海南省', city: '儋州市', lat: 19.5209, lng: 109.5807 },
  { province: '甘肃省', city: '嘉峪关市', lat: 39.7731, lng: 98.2892 },
  { province: '香港特别行政区', city: '香港', lat: 22.3193, lng: 114.1694 },
  { province: '澳门特别行政区', city: '澳门', lat: 22.1987, lng: 113.5439 },
  { province: '台湾省', city: '台北市', lat: 25.033, lng: 121.5654 },
  { province: '台湾省', city: '高雄市', lat: 22.6273, lng: 120.3014 },
  { province: '台湾省', city: '台中市', lat: 24.1477, lng: 120.6736 },
  { province: '台湾省', city: '台南市', lat: 22.9997, lng: 120.227 },
]

const ALL = cityCenters.concat(EXTRA)

function haversineKm(lat1, lng1, lat2, lng2) {
  const r = 6371
  const p = Math.PI / 180
  const a =
    0.5 -
    Math.cos((lat2 - lat1) * p) / 2 +
    (Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lng2 - lng1) * p))) / 2
  return 2 * r * Math.asin(Math.sqrt(a))
}

/** @returns {{province:string,city:string}|null} */
function resolveNearestCity(lat, lng) {
  const la = Number(lat)
  const lo = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null
  let best = null
  let bestD = Infinity
  for (const c of ALL) {
    const d = haversineKm(la, lo, c.lat, c.lng)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best ? { province: best.province, city: best.city } : null
}

module.exports = {
  resolveNearestCity,
  haversineKm,
}
