const china = require('./chinaRegion.js')

function filterProvinces(keyword) {
  const kw = String(keyword || '').trim()
  const all = china.provinceList()
  if (!kw) return all
  return all.filter((p) => {
    if (p.includes(kw)) return true
    return china.cityList(p).some((c) => c.includes(kw))
  })
}

function filterCitiesForProvince(province, keyword) {
  const kw = String(keyword || '').trim()
  let cities = china.cityList(province)
  if (!kw) return cities
  if (province.includes(kw)) return cities
  return cities.filter((c) => c.includes(kw))
}

/** 左侧省份列表（含当前高亮） */
function buildProvinceRows(keyword, activeProvince) {
  const provinces = filterProvinces(keyword)
  const active =
    activeProvince && provinces.includes(activeProvince) ? activeProvince : provinces[0] || ''
  return {
    activeProvince: active,
    rows: provinces.map((name) => ({ name, active: name === active })),
  }
}

/** 当前省下的城市勾选列表 */
function buildCityCheckGrid(province, keyword, selectedCities) {
  if (!province) return []
  const cities = filterCitiesForProvince(province, keyword)
  const sel = new Set(selectedCities || [])
  return cities.map((name) => ({ name, on: sel.has(name) }))
}

function initModalState(keyword, activeProvinceHint, selectedCities) {
  const { activeProvince, rows } = buildProvinceRows(keyword, activeProvinceHint)
  const cityCheckGrid = buildCityCheckGrid(activeProvince, keyword, selectedCities)
  return { activeProvince, provinceRows: rows, cityCheckGrid }
}

module.exports = {
  filterProvinces,
  filterCitiesForProvince,
  buildProvinceRows,
  buildCityCheckGrid,
  initModalState,
}
