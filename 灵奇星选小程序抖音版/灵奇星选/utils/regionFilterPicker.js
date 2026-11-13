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

function toIndex(raw, maxExclusive) {
  const n = Number(raw)
  const idx = Number.isFinite(n) ? Math.floor(n) : 0
  if (!(maxExclusive > 0)) return 0
  return Math.max(0, Math.min(idx, maxExclusive - 1))
}

function regionFilterLabel(province, city) {
  const p = String(province || ALL_PROV).trim() || ALL_PROV
  const c = String(city || ALL_CITY).trim() || ALL_CITY
  if (p === ALL_PROV && c === ALL_CITY) return '城市'
  if (c !== ALL_CITY) return c.length > 6 ? `${c.slice(0, 5)}…` : c
  if (p !== ALL_PROV) return p.length > 6 ? `${p.slice(0, 5)}…` : p
  return '城市'
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

/**
 * multiSelector 受控组件：每一列滚动都必须同步 value，
 * 否则 setData 旧索引会把滚轮强制拉回（表现为「回滚至初始值」）。
 * 城市列只改 value，禁止重建 range，避免 iOS 整列刷新回弹。
 */
function onRegionFilterColumnChange(state, column, value) {
  const col = Number(column)
  const range = state && state.regionMultiRange
  const prevVal = Array.isArray(state && state.regionMultiValue)
    ? state.regionMultiValue
    : [0, 0]
  const provCol = (range && range[0]) || []
  const cityCol = (range && range[1]) || []

  if (col === 0) {
    const idx = toIndex(value, provCol.length || 1)
    const nextProvince = provCol[idx] || ALL_PROV
    const regionMultiRange = buildMultiRange(nextProvince)
    return {
      regionMultiRange,
      regionMultiValue: [idx, 0],
    }
  }

  if (col === 1) {
    const idx = toIndex(value, cityCol.length || 1)
    const pi = toIndex(prevVal[0], provCol.length || 1)
    return {
      regionMultiValue: [pi, idx],
    }
  }

  return null
}

function onRegionFilterChange(state, values) {
  const raw = Array.isArray(values) ? values : [0, 0]
  const provinces = (state && state.regionMultiRange && state.regionMultiRange[0]) || []
  const pi = toIndex(raw[0], provinces.length || 1)
  const nextProvince = provinces[pi] || ALL_PROV
  const regionMultiRange = buildMultiRange(nextProvince)
  const cities = regionMultiRange[1] || []
  const ci = toIndex(raw[1], cities.length || 1)
  const filterProvince = nextProvince
  const filterCity = cities[ci] || ALL_CITY
  return {
    filterProvince,
    filterCity,
    regionFilterLabel: regionFilterLabel(filterProvince, filterCity),
    regionMultiRange,
    regionMultiValue: [pi, ci],
  }
}

module.exports = {
  initRegionFilterState,
  onRegionFilterColumnChange,
  onRegionFilterChange,
  regionFilterLabel,
}
