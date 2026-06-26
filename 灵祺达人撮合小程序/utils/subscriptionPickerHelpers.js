const { PLATFORMS, TALENT_TAGS } = require('./publishFormOptions.js')
const cityPicker = require('./publishCityPicker.js')

function buildPlatformGrid(selected) {
  const set = new Set(selected || [])
  return PLATFORMS.map((name) => ({ name, on: set.has(name) }))
}

function buildTagGrid(selected) {
  const set = new Set(selected || [])
  return TALENT_TAGS.map((name) => ({ name, on: set.has(name), disabled: false }))
}

function formatPlatformsDisplay(platforms) {
  const list = platforms || []
  if (!list.length) return '全部平台'
  if (list.length <= 3) return list.join('、')
  return `${list.slice(0, 3).join('、')} 等${list.length}个`
}

function formatCitiesDisplay(cityNational, selectedCities) {
  if (cityNational) return '全国'
  const cities = selectedCities || []
  if (!cities.length) return '请选择关注城市'
  if (cities.length <= 2) return cities.join('、')
  return `${cities.slice(0, 2).join('、')} 等${cities.length}城`
}

function formatTagsDisplay(tags) {
  const list = tags || []
  if (!list.length) return '请选择关注品类'
  if (list.length <= 3) return list.join('、')
  return `${list.slice(0, 3).join('、')} 等${list.length}个`
}

function citiesToSubscription(cityNational, selectedCities) {
  if (cityNational) return ['全国']
  return [...(selectedCities || [])]
}

function citiesFromSubscription(cities) {
  const list = Array.isArray(cities) ? cities.filter(Boolean) : []
  if (list.includes('全国')) return { cityNational: true, selectedCities: [] }
  return { cityNational: false, selectedCities: list }
}

module.exports = {
  PLATFORMS,
  TALENT_TAGS,
  buildPlatformGrid,
  buildTagGrid,
  formatPlatformsDisplay,
  formatCitiesDisplay,
  formatTagsDisplay,
  citiesToSubscription,
  citiesFromSubscription,
  cityPicker,
}
