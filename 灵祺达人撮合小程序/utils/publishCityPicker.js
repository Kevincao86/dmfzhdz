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

function provinceScopeLabel(province) {
  const name = String(province || '')
  if (name.endsWith('市') || name.includes('特别行政区')) return '全市'
  return '全省'
}

function isWholeProvince(province, selectedProvinces) {
  return (selectedProvinces || []).includes(province)
}

/** 左侧省份列表（含当前高亮、是否已按省招募） */
function buildProvinceRows(keyword, activeProvince, selectedProvinces) {
  const provinces = filterProvinces(keyword)
  const active =
    activeProvince && provinces.includes(activeProvince) ? activeProvince : provinces[0] || ''
  const whole = new Set(selectedProvinces || [])
  return {
    activeProvince: active,
    rows: provinces.map((name) => ({ name, active: name === active, whole: whole.has(name) })),
  }
}

/** 当前省下的城市勾选列表。整省已选时，省内城市视为已包含。 */
function buildCityCheckGrid(province, keyword, selectedCities, selectedProvinces) {
  if (!province) return []
  const cities = filterCitiesForProvince(province, keyword)
  const sel = new Set(selectedCities || [])
  const whole = isWholeProvince(province, selectedProvinces)
  return cities.map((name) => ({ name, on: whole || sel.has(name) }))
}

function initModalState(keyword, activeProvinceHint, selectedCities, selectedProvinces) {
  const provinces = selectedProvinces || []
  const { activeProvince, rows } = buildProvinceRows(keyword, activeProvinceHint, provinces)
  const cityCheckGrid = buildCityCheckGrid(activeProvince, keyword, selectedCities, provinces)
  return {
    activeProvince,
    provinceRows: rows,
    cityCheckGrid,
    provinceWhole: isWholeProvince(activeProvince, provinces),
    provinceScopeLabel: provinceScopeLabel(activeProvince),
  }
}

function citiesOf(province) {
  return china.cityList(province)
}

/** 勾选/取消整省。选中后不再把省内城市逐个记进城市列表。 */
function toggleProvince(province, selectedProvinces, selectedCities) {
  const covered = new Set(citiesOf(province))
  const provinces = [...(selectedProvinces || [])]
  const cities = [...(selectedCities || [])].filter((c) => !covered.has(c))
  const idx = provinces.indexOf(province)
  if (idx >= 0) provinces.splice(idx, 1)
  else provinces.push(province)
  return { selectedProvinces: provinces, selectedCities: cities }
}

/** 勾选单个城市。若当前是整省，取消其中一城会拆成「其余城市」。 */
function toggleCity(province, city, selectedProvinces, selectedCities) {
  const provinces = [...(selectedProvinces || [])]
  let cities = [...(selectedCities || [])]
  const pIdx = provinces.indexOf(province)
  if (pIdx >= 0) {
    provinces.splice(pIdx, 1)
    const rest = citiesOf(province).filter((c) => c !== city)
    const covered = new Set(citiesOf(province))
    cities = cities.filter((c) => !covered.has(c)).concat(rest)
    return { selectedProvinces: provinces, selectedCities: cities }
  }
  const idx = cities.indexOf(city)
  if (idx >= 0) cities.splice(idx, 1)
  else cities.push(city)
  return { selectedProvinces: provinces, selectedCities: cities }
}

function areaChips(selectedProvinces, selectedCities) {
  const chips = (selectedProvinces || []).map((name) => ({
    name,
    label: `${name}（${provinceScopeLabel(name)}）`,
    kind: 'province',
  }))
  for (const name of selectedCities || []) {
    chips.push({ name, label: name, kind: 'city' })
  }
  return chips
}

function areaDisplayText(cityNational, selectedProvinces, selectedCities) {
  if (cityNational) return '全国'
  const labels = [
    ...(selectedProvinces || []).map((name) => `${name}（${provinceScopeLabel(name)}）`),
    ...(selectedCities || []),
  ]
  if (!labels.length) return ''
  if (labels.length <= 2) return labels.join('、')
  return `${labels.slice(0, 2).join('、')} 等${labels.length}个地区`
}

function partitionAreaTokens(tokens) {
  const known = new Set(china.provinceList())
  const selectedProvinces = []
  const selectedCities = []
  for (const raw of tokens || []) {
    const name = String(raw || '').trim()
    if (!name || name === '全国') continue
    if (known.has(name)) {
      if (!selectedProvinces.includes(name)) selectedProvinces.push(name)
    } else if (!selectedCities.includes(name)) {
      selectedCities.push(name)
    }
  }
  return { selectedProvinces, selectedCities }
}

/** 订单 region 写了省名时，该省下任意城市筛选都命中。 */
function regionCoversCity(region, cityFilter) {
  const prov = china.findProvinceForCity(cityFilter)
  if (!prov) return false
  const short = prov.replace(/省$|市$|自治区$|壮族$|回族$|维吾尔$/, '').trim()
  const parts = String(region || '').split(/[·/\s,，、]+/)
  return parts.some((part) => {
    const p = String(part || '').trim()
    if (!p) return false
    if (p === prov) return true
    return short.length >= 2 && p === short
  })
}

module.exports = {
  filterProvinces,
  filterCitiesForProvince,
  provinceScopeLabel,
  buildProvinceRows,
  buildCityCheckGrid,
  initModalState,
  toggleProvince,
  toggleCity,
  areaChips,
  areaDisplayText,
  partitionAreaTokens,
  regionCoversCity,
}
