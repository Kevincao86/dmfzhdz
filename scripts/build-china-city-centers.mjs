#!/usr/bin/env node
/**
 * 从 cn-pcas-geo 生成 chinaCityCenters.js（需先下载 xzqh_with_amap_coordinates.json）
 * curl -sSL -o /tmp/xzqh_coords.json https://raw.githubusercontent.com/simonkuang/cn-pcas-geo/main/xzqh_with_amap_coordinates.json
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const china = require('../灵祺达人撮合小程序/utils/chinaRegion.js')
const src = process.argv[2] || '/tmp/xzqh_coords.json'
const raw = JSON.parse(fs.readFileSync(src, 'utf8'))

function avgCenter(nodes) {
  let lat = 0
  let lng = 0
  let n = 0
  for (const x of nodes || []) {
    const la = Number(x.center?.latitude)
    const lo = Number(x.center?.longitude)
    if (Number.isFinite(la) && Number.isFinite(lo)) {
      lat += la
      lng += lo
      n++
    }
  }
  if (!n) return null
  return { lat: lat / n, lng: lng / n }
}

function walkProvince(provNode) {
  const out = []
  const province = String(provNode.name || '').trim()
  for (const child of provNode.children || []) {
    const level = String(child.level || '').trim()
    const name = String(child.name || '').trim()
    if (level === 'prefecture') {
      const c = avgCenter(child.children) || child.center
      const hit = china.resolveRegionNames(province, name)
      if (hit && c && Number.isFinite(c.lat)) {
        out.push({
          province: hit.province,
          city: hit.city,
          lat: +c.lat.toFixed(4),
          lng: +c.lng.toFixed(4),
        })
      }
    }
  }
  if (['北京市', '天津市', '上海市', '重庆市'].includes(province)) {
    const c = avgCenter(provNode.children)
    const hit = china.resolveRegionNames(province, province)
    if (hit && c) {
      out.push({
        province: hit.province,
        city: hit.city,
        lat: +c.lat.toFixed(4),
        lng: +c.lng.toFixed(4),
      })
    }
  }
  return out
}

const centers = []
for (const p of raw) centers.push(...walkProvince(p))
const uniq = []
const seen = new Set()
for (const c of centers) {
  const k = `${c.province}|${c.city}`
  if (seen.has(k)) continue
  seen.add(k)
  uniq.push(c)
}

const outPath = new URL('../灵祺达人撮合小程序/utils/chinaCityCenters.js', import.meta.url)
fs.writeFileSync(
  outPath,
  `/** 地级市中心坐标 GCJ-02（cn-pcas-geo / 高德区划中心均值） */\nmodule.exports = ${JSON.stringify(uniq, null, 2)}\n`,
)
console.log('written', uniq.length, 'cities →', outPath.pathname)
