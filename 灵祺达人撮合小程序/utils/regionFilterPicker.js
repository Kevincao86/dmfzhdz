const regionPicker = require('./regionPicker.js')
const china = require('./chinaRegion.js')

const ALL_PROV = '全部'
const ALL_CITY = '全部'

function citiesForProvince(province) {
  if (!province || province === ALL_PROV) return [ALL_CITY]
  return [ALL_CITY, ...regionPicker.setupRegionState(province, '').cities]
}

function buildMultiRange(province) {
  return [[ALL_PROV, ...china.provinceList()], citiesForProvince(province)]
}

function findIndex(list, val, fallback) {
  const i = (list || []).indexOf(val)
  return i >= 0 ? i : fallback != null ? fallback : 0
}

function regionFilterLabel(province, city) {
  const p = String(province || ALL_PROV).trim() || ALL_PROV
  const c = String(city || ALL_CITY).trim() || ALL_CITY
  if (p === ALL_PROV && c === ALL_CITY) return '全部城市'
  if (c !== ALL_CITY) return c
  if (p !== ALL_PROV) return p
  return '全部城市'
}

function initRegionFilterState(province, city) {
  const filterProvince = String(province || ALL_PROV).trim() || ALL_PROV
  const filterCity = String(city || ALL_CITY).trim() || ALL_CITY
  const activeProvince = filterProvince === ALL_PROV ? ALL_PROV : filterProvince
  const regionMultiRange = buildMultiRange(activeProvince)
  return {
    filterProvince,
    filterCity,
    regionFilterLabel: regionFilterLabel(filterProvince, filterCity),
    regionMultiRange,
    regionMultiValue: [
      findIndex(regionMultiRange[0], filterProvince),
      findIndex(regionMultiRange[1], filterCity),
    ],
  }
}

function onRegionFilterColumnChange(state, column, value) {
  if (Number(column) !== 0) return state
  const idx = Number(value) || 0
  const provinces = state.regionMultiRange[0] || []
  const nextProvince = provinces[idx] || ALL_PROV
  const regionMultiRange = buildMultiRange(nextProvince)
  return {
    ...state,
    regionMultiRange,
    regionMultiValue: [idx, 0],
  }
}

function onRegionFilterChange(state, values) {
  const pi = Number(values[0]) || 0
  const ci = Number(values[1]) || 0
  const provinces = state.regionMultiRange[0] || []
  const nextProvince = provinces[pi] || ALL_PROV
  const regionMultiRange = buildMultiRange(nextProvince)
  const cities = regionMultiRange[1] || []
  const filterProvince = nextProvince
  const filterCity = cities[Math.min(ci, cities.length - 1)] || ALL_CITY
  return {
    filterProvince,
    filterCity,
    regionFilterLabel: regionFilterLabel(filterProvince, filterCity),
    regionMultiRange,
    regionMultiValue: [pi, Math.min(ci, cities.length - 1)],
  }
}

module.exports = {
  initRegionFilterState,
  onRegionFilterColumnChange,
  onRegionFilterChange,
  regionFilterLabel,
}
