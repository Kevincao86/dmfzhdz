import * as china from './chinaRegion'

export function filterProvinces(keyword: string) {
  const kw = String(keyword || '').trim()
  const all = china.provinceList()
  if (!kw) return all
  return all.filter((p) => p.includes(kw) || china.cityList(p).some((c) => c.includes(kw)))
}

export function filterCitiesForProvince(province: string, keyword: string) {
  const kw = String(keyword || '').trim()
  let cities = china.cityList(province)
  if (!kw) return cities
  if (province.includes(kw)) return cities
  return cities.filter((c) => c.includes(kw))
}

export function provinceScopeLabel(province: string) {
  const name = String(province || '')
  if (name.endsWith('市') || name.includes('特别行政区')) return '全市'
  return '全省'
}

export function isWholeProvince(province: string, selectedProvinces: string[]) {
  return (selectedProvinces || []).includes(province)
}

export function buildProvinceRows(keyword: string, activeProvince: string, selectedProvinces: string[] = []) {
  const provinces = filterProvinces(keyword)
  const active = activeProvince && provinces.includes(activeProvince) ? activeProvince : provinces[0] || ''
  const whole = new Set(selectedProvinces || [])
  return {
    activeProvince: active,
    rows: provinces.map((name) => ({ name, active: name === active, whole: whole.has(name) })),
  }
}

export function buildCityCheckGrid(
  province: string,
  keyword: string,
  selectedCities: string[],
  selectedProvinces: string[] = [],
) {
  if (!province) return []
  const cities = filterCitiesForProvince(province, keyword)
  const sel = new Set(selectedCities || [])
  const whole = isWholeProvince(province, selectedProvinces)
  return cities.map((name) => ({ name, on: whole || sel.has(name) }))
}

export function initModalState(
  keyword: string,
  activeProvinceHint: string,
  selectedCities: string[],
  selectedProvinces: string[] = [],
) {
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

export function toggleProvince(province: string, selectedProvinces: string[], selectedCities: string[]) {
  const covered = new Set(china.cityList(province))
  const provinces = [...(selectedProvinces || [])]
  const cities = [...(selectedCities || [])].filter((c) => !covered.has(c))
  const idx = provinces.indexOf(province)
  if (idx >= 0) provinces.splice(idx, 1)
  else provinces.push(province)
  return { selectedProvinces: provinces, selectedCities: cities }
}

export function toggleCity(
  province: string,
  city: string,
  selectedProvinces: string[],
  selectedCities: string[],
) {
  const provinces = [...(selectedProvinces || [])]
  let cities = [...(selectedCities || [])]
  const pIdx = provinces.indexOf(province)
  if (pIdx >= 0) {
    provinces.splice(pIdx, 1)
    const rest = china.cityList(province).filter((c) => c !== city)
    const covered = new Set(china.cityList(province))
    cities = cities.filter((c) => !covered.has(c)).concat(rest)
    return { selectedProvinces: provinces, selectedCities: cities }
  }
  const idx = cities.indexOf(city)
  if (idx >= 0) cities.splice(idx, 1)
  else cities.push(city)
  return { selectedProvinces: provinces, selectedCities: cities }
}

export function areaChips(selectedProvinces: string[], selectedCities: string[]) {
  const chips: { name: string; label: string; kind: 'province' | 'city' }[] = (selectedProvinces || []).map((name) => ({
    name,
    label: `${name}（${provinceScopeLabel(name)}）`,
    kind: 'province',
  }))
  for (const name of selectedCities || []) {
    chips.push({ name, label: name, kind: 'city' })
  }
  return chips
}

export function areaDisplayText(cityNational: boolean, selectedProvinces: string[], selectedCities: string[]) {
  if (cityNational) return '全国'
  const labels = [
    ...(selectedProvinces || []).map((name) => `${name}（${provinceScopeLabel(name)}）`),
    ...(selectedCities || []),
  ]
  if (!labels.length) return ''
  if (labels.length <= 2) return labels.join('、')
  return `${labels.slice(0, 2).join('、')} 等${labels.length}个地区`
}

export function partitionAreaTokens(tokens: string[]) {
  const known = new Set(china.provinceList())
  const selectedProvinces: string[] = []
  const selectedCities: string[] = []
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

export function regionCoversCity(region: string, cityFilter: string) {
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
