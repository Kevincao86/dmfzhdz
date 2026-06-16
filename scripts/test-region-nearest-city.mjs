#!/usr/bin/env node
/** 模糊定位逆地理：最近城市匹配单元测试 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nearest = require('../灵祺达人撮合小程序/utils/chinaNearestCity.js')
const china = require('../灵祺达人撮合小程序/utils/chinaRegion.js')

const cases = [
  { lat: 29.8683, lng: 121.544, expectCity: '宁波市', expectProvince: '浙江省' },
  { lat: 30.2741, lng: 120.1551, expectCity: '杭州市', expectProvince: '浙江省' },
  { lat: 39.9042, lng: 116.4074, expectCity: '北京市', expectProvince: '北京市' },
]

let failed = 0
for (const c of cases) {
  const hit = nearest.resolveNearestCity(c.lat, c.lng)
  const ok = hit && hit.city === c.expectCity && hit.province === c.expectProvince
  console.log(ok ? 'OK' : 'FAIL', c.expectProvince, c.expectCity, '→', hit)
  if (!ok) failed++
}

const resolved = china.resolveRegionNames('浙江省', '宁波市')
console.log('resolveRegionNames', resolved)
process.exit(failed ? 1 : 0)
