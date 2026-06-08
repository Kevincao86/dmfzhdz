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

export function buildProvinceRows(keyword: string, activeProvince: string) {
  const provinces = filterProvinces(keyword)
  const active = activeProvince && provinces.includes(activeProvince) ? activeProvince : provinces[0] || ''
  return {
    activeProvince: active,
    rows: provinces.map((name) => ({ name, active: name === active })),
  }
}

export function buildCityCheckGrid(province: string, keyword: string, selectedCities: string[]) {
  if (!province) return []
  const cities = filterCitiesForProvince(province, keyword)
  const sel = new Set(selectedCities || [])
  return cities.map((name) => ({ name, on: sel.has(name) }))
}

export function initCityPickerState(keyword: string, activeProvinceHint: string, selectedCities: string[]) {
  const { activeProvince, rows } = buildProvinceRows(keyword, activeProvinceHint)
  const cityCheckGrid = buildCityCheckGrid(activeProvince, keyword, selectedCities)
  return { activeProvince, provinceRows: rows, cityCheckGrid }
}

export function formatRecruitmentCitySummary(cityNational: boolean, selectedCities: string[]): string {
  if (cityNational) return '全国'
  const cities = selectedCities || []
  if (!cities.length) return ''
  if (cities.length <= 2) return cities.join('、')
  return `${cities.slice(0, 2).join('、')} 等${cities.length}城`
}

export function formatRecruitmentCityDisplay(cityNational: boolean, selectedCities: string[]): string {
  return formatRecruitmentCitySummary(cityNational, selectedCities) || '请选择招募城市'
}

export function primaryRecruitmentCity(cityNational: boolean, selectedCities: string[]): string {
  if (cityNational) return '全国'
  return String((selectedCities || [])[0] || '').trim()
}

export function hasRecruitmentCitySelection(cityNational: boolean, selectedCities: string[]): boolean {
  return cityNational || (selectedCities || []).length > 0
}
