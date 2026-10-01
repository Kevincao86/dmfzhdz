/**
 * POST /api/meoo-shop-eval-locate
 * 门店首次评估：高德省市区、地址定位、周边同类门店。不扣积分、不看会员。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyBearerJwt } from '../vite-plugins/aiGateway/authSupabase.js'
import {
  amapGeocodeAddress,
  amapPlaceNearby,
  amapQueryForIndustry,
  isAmapMapConfigured,
} from '../vite-plugins/amapMapClient.js'
import { handleMerchantApiOptions, rawBody, sendMerchantJson } from './merchant/merchantGatewayShared.js'

export const config = { maxDuration: 30 }

function amapKey(env: Record<string, string | undefined>) {
  return (
    env.AMAP_WEB_KEY?.trim() ||
    env.AMAP_MAP_KEY?.trim() ||
    env.GAODE_MAP_KEY?.trim() ||
    env.MERCHANT_AI_AMAP_KEY?.trim() ||
    ''
  )
}

async function districtNames(keywords: string, env: Record<string, string | undefined>) {
  const key = amapKey(env)
  if (!key) return { ok: false as const, message: '未配置高德地图' }
  const qs = new URLSearchParams({
    key,
    keywords: keywords.trim() || '中国',
    subdistrict: '1',
    extensions: 'base',
    output: 'JSON',
  })
  const res = await fetch(`https://restapi.amap.com/v3/config/district?${qs.toString()}`)
  const json = (await res.json()) as { status?: string; info?: string; districts?: Array<{ districts?: Array<{ name?: string }> }> }
  if (String(json.status) !== '1') return { ok: false as const, message: String(json.info || '高德行政区查询失败') }
  const names = (json.districts?.[0]?.districts || [])
    .map((row) => String(row.name || '').trim())
    .filter(Boolean)
  return { ok: true as const, names }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  const env = process.env as Record<string, string>
  const session = await verifyBearerJwt(typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined, env)
  if (!session) {
    sendMerchantJson(res, 401, { ok: false, error: 'unauthorized', message: '请先登录' })
    return
  }
  let body: { action?: string; keywords?: string; address?: string; city?: string; category?: string }
  try {
    body = JSON.parse(rawBody(req) || '{}') as typeof body
  } catch {
    sendMerchantJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  if (!isAmapMapConfigured(env)) {
    sendMerchantJson(res, 200, { ok: false, error: 'amap_unconfigured', message: '未配置高德地图' })
    return
  }
  if (body.action === 'districts') {
    const hit = await districtNames(String(body.keywords || '中国'), env)
    if (!hit.ok) {
      sendMerchantJson(res, 200, { ok: false, message: hit.message })
      return
    }
    sendMerchantJson(res, 200, { ok: true, names: hit.names })
    return
  }
  const address = String(body.address || '').trim()
  const city = String(body.city || '').trim()
  const category = String(body.category || '').trim()
  if (!address) {
    sendMerchantJson(res, 400, { ok: false, message: '请填写地址' })
    return
  }
  const geo = await amapGeocodeAddress(env, address, city)
  if (!geo.ok) {
    sendMerchantJson(res, 200, { ok: false, message: geo.message })
    return
  }
  const query = amapQueryForIndustry(category || '餐饮')
  const nearby = await amapPlaceNearby(env, { location: geo.location, query, radiusM: 3000, pageSize: 8 })
  const pois = nearby.ok
    ? nearby.pois.slice(0, 8).map((poi) => ({
        name: poi.name,
        distanceM: poi.distanceM,
      }))
    : []
  const poiLine = pois.length
    ? pois.map((poi) => `${poi.name}${poi.distanceM != null ? ` ${poi.distanceM}米` : ''}`).join('；')
    : '3 公里内没有检索到同类门店'
  const mapNote = `高德已定位到该地址（坐标 ${geo.location.lng},${geo.location.lat}）。周边同类「${query}」：${poiLine}。`
  sendMerchantJson(res, 200, {
    ok: true,
    location: geo.location,
    mapNote,
    pois,
  })
}
