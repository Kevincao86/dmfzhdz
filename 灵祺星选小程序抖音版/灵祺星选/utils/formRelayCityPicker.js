const china = require('./chinaRegion.js')
const cityPicker = require('./publishCityPicker.js')

const ALL_CITIES = china.allCitiesFlat()

function parseRegionToCityState(region) {
  const raw = String(region || '').trim()
  if (!raw || raw === '全国' || raw === '不限') {
    return { cityNational: true, selectedCities: [] }
  }
  const parts = raw
    .split(/[、,，/\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const matched = []
  for (const p of parts) {
    if (ALL_CITIES.includes(p)) {
      if (matched.indexOf(p) < 0) matched.push(p)
      continue
    }
    const short = p.replace(/市$/, '')
    const hit = ALL_CITIES.find((c) => c === p || c.replace(/市$/, '') === short || c.indexOf(p) >= 0)
    if (hit && matched.indexOf(hit) < 0) matched.push(hit)
  }
  if (matched.length) return { cityNational: false, selectedCities: matched }
  return { cityNational: false, selectedCities: [] }
}

function buildRegionFromCityState(cityNational, selectedCities) {
  if (cityNational) return '全国'
  const cities = selectedCities || []
  return cities.length ? cities.join('、') : '全国'
}

function formatCityDisplayText(cityNational, selectedCities) {
  if (cityNational) return '全国'
  const cities = selectedCities || []
  if (!cities.length) return '请选择招募城市'
  if (cities.length <= 2) return cities.join('、')
  return cities.slice(0, 2).join('、') + ' 等' + cities.length + '城'
}

module.exports = {
  parseRegionToCityState,
  buildRegionFromCityState,
  formatCityDisplayText,
  initModalState: cityPicker.initModalState,
}
