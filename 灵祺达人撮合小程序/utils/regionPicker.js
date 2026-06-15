const china = require('./chinaRegion.js')

/** 初始化省/市 picker 状态 */
function setupRegionState(province, city) {
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

function onProvincePick(page, e) {
  const i = Number(e.detail.value)
  const provinces = page.data.provinces || china.provinceList()
  const province = provinces[i] || provinces[0]
  const cities = china.cityList(province)
  page.setData({
    provinceIndex: i,
    province,
    cities,
    cityIndex: 0,
    city: cities[0] || '',
  })
}

function onCityPick(page, e) {
  const i = Number(e.detail.value)
  const cities = page.data.cities || []
  page.setData({
    cityIndex: i,
    city: cities[i] || '',
  })
}

function applyRegionToPage(page, province, city) {
  const region = setupRegionState(province, city)
  page.setData(region)
  return region
}

module.exports = {
  setupRegionState,
  onProvincePick,
  onCityPick,
  applyRegionToPage,
  validateRegion: china.validateRegion,
}
