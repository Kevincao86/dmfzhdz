const china = require('./chinaRegion.js')

/** 初始化省/市 picker 状态（未填写时不默认北京市） */
function setupRegionState(province, city) {
  const provinces = china.provinceList()
  const pRaw = String(province || '').trim()
  const cRaw = String(city || '').trim()
  if (!pRaw) {
    return {
      provinces,
      cities: [],
      province: '',
      city: '',
      provinceIndex: 0,
      cityIndex: 0,
    }
  }
  let provinceIndex = provinces.indexOf(pRaw)
  if (provinceIndex < 0) provinceIndex = 0
  const p = provinces.includes(pRaw) ? pRaw : provinces[provinceIndex]
  const cities = china.cityList(p)
  let cityIndex = cRaw ? cities.indexOf(cRaw) : -1
  if (cityIndex < 0) cityIndex = 0
  return {
    provinces,
    cities,
    province: p,
    city: cRaw && cities.includes(cRaw) ? cRaw : cities[cityIndex] || '',
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
