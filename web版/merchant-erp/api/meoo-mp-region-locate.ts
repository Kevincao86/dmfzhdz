/**
 * GET /api/meoo-mp-region-locate — 小程序注册自动定位：GPS 逆地理或 IP 兜底
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const china = require('../../../灵祺达人撮合小程序/utils/chinaRegion.js') as {
  resolveRegionNames: (p: string, c: string) => { province: string; city: string } | null
}

export const config = { maxDuration: 15 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function parseCoord(raw: unknown): number | null {
  const n = Number.parseFloat(String(raw ?? '').trim())
  return Number.isFinite(n) ? n : null
}

async function locateByCoords(lat: number, lng: number) {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(String(lat))}&longitude=${encodeURIComponent(String(lng))}&localityLanguage=zh`
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (!res.ok) return null
  const data = (await res.json()) as {
    principalSubdivision?: string
    city?: string
    locality?: string
  }
  const province = String(data.principalSubdivision || '').trim()
  const city = String(data.city || data.locality || '').trim()
  if (!province && !city) return null
  return china.resolveRegionNames(province, city)
}

async function locateByIp() {
  const res = await fetch('https://whois.pconline.com.cn/ipJson.jsp?json=true', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MeooMpRegion/1.0)' },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) return null
  const text = (await res.text()).trim()
  let json: { pro?: string; city?: string; addr?: string }
  try {
    json = JSON.parse(text) as { pro?: string; city?: string; addr?: string }
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    json = JSON.parse(m[0]) as { pro?: string; city?: string; addr?: string }
  }
  const province = String(json.pro || '').trim()
  const city = String(json.city || '').trim()
  if (!province && !city) return null
  return china.resolveRegionNames(province, city)
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, message: 'method_not_allowed' })
    return
  }

  const lat = parseCoord(req.query?.lat)
  const lng = parseCoord(req.query?.lng)

  try {
    if (lat != null && lng != null) {
      const hit = await locateByCoords(lat, lng)
      if (hit) {
        sendJson(res, 200, { ok: true, ...hit, source: 'gps' })
        return
      }
    }
    const ipHit = await locateByIp()
    if (ipHit) {
      sendJson(res, 200, { ok: true, ...ipHit, source: 'ip' })
      return
    }
    sendJson(res, 502, { ok: false, message: 'region_unresolved' })
  } catch (e) {
    sendJson(res, 502, {
      ok: false,
      message: e instanceof Error ? e.message : 'region_locate_failed',
    })
  }
}
