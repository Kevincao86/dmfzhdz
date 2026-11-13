import * as china from './chinaRegion'

export function setupRegionState(province: string, city: string) {
  const provinces = china.provinceList()
  let provinceIndex = provinces.indexOf(province)
  if (provinceIndex < 0) provinceIndex = 0
  const p = provinces[provinceIndex]
  const cities = china.cityList(p)
  let cityIndex = city ? cities.indexOf(city) : 0
  if (cityIndex < 0) cityIndex = 0
  return {
    provinces,
    cities,
    province: province && provinces.includes(province) ? province : p,
    city: city && cities[cityIndex] ? city : cities[0] || '',
    provinceIndex,
    cityIndex,
  }
}

export function validateRegion(province: string, city: string) {
  return china.validateRegion(province, city)
}
