/**
 * GET /api/meoo-map-static — 选址/竞品热力底图（服务端拉高德/百度静态图，避免把 REST key 暴露给浏览器）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  sendMerchantJson,
} from './merchant/merchantGatewayShared.js'
import { verifyBearerJwt } from '../vite-plugins/aiGateway/authSupabase.js'
import { mapFetchStaticMap, type MapProviderId } from '../vite-plugins/mapProvidersClient.js'

export const config = { maxDuration: 30 }

const CACHE_MAX = 48
const cache = new Map<
  string,
  { bytes: Uint8Array; contentType: string; provider: MapProviderId; at: number }
>()

function qStr(q: VercelRequest['query'], key: string): string {
  const v = q?.[key]
  return Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '')
}

function parseProvider(raw: string): MapProviderId | undefined {
  const v = raw.trim().toLowerCase()
  if (v === 'amap' || v === 'baidu') return v
  return undefined
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') {
    sendMerchantJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  const env = process.env as Record<string, string>
  const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
  const session = await verifyBearerJwt(auth, env)
  if (!session) {
    sendMerchantJson(res, 401, { ok: false, error: 'unauthorized' })
    return
  }

  const lat = Number(qStr(req.query, 'lat'))
  const lng = Number(qStr(req.query, 'lng'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -85 || lat > 85 || lng < -180 || lng > 180) {
    sendMerchantJson(res, 400, { ok: false, error: 'lat_lng_required' })
    return
  }
  const zoom = Math.min(17, Math.max(11, Math.round(Number(qStr(req.query, 'zoom')) || 15)))
  const width = Math.min(1024, Math.max(240, Math.round(Number(qStr(req.query, 'w')) || 750)))
  const height = Math.min(1024, Math.max(180, Math.round(Number(qStr(req.query, 'h')) || 420)))
  const provider = parseProvider(qStr(req.query, 'provider'))

  const cacheKey = `${provider ?? 'auto'}:${lat.toFixed(4)}:${lng.toFixed(4)}:${zoom}:${width}:${height}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < 6 * 60 * 60 * 1000) {
    res.setHeader('Content-Type', hit.contentType)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.setHeader('X-Map-Provider', hit.provider)
    res.status(200).send(Buffer.from(hit.bytes))
    return
  }

  let aiEnv = env
  try {
    const { mergeMerchantAiEnvWithRegistrySnapshot } = await import(
      '../vite-plugins/merchantRegistryVendorEnv.js'
    )
    aiEnv = await mergeMerchantAiEnvWithRegistrySnapshot(process.cwd(), env)
  } catch {
    /* 无运营台快照时用进程环境变量 */
  }

  const out = await mapFetchStaticMap(aiEnv, {
    location: { lat, lng },
    zoom,
    width,
    height,
    ...(provider ? { provider } : {}),
  })
  if (!out.ok) {
    sendMerchantJson(res, 502, { ok: false, error: 'map_static_failed', detail: out.message })
    return
  }

  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value
    if (first) cache.delete(first)
  }
  cache.set(cacheKey, {
    bytes: out.bytes,
    contentType: out.contentType,
    provider: out.provider,
    at: Date.now(),
  })

  res.setHeader('Content-Type', out.contentType)
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.setHeader('X-Map-Provider', out.provider)
  res.status(200).send(Buffer.from(out.bytes))
}
