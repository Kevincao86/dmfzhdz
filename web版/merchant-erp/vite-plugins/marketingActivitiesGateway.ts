/**
 * 营销中心：分平台拉取「平台营销活动 / 招商报名」类 OpenAPI 列表。
 * 抖音：goodlife marketing activity query（见 douyinMerchantGateway）
 * 美团 / 小红书：环境变量配置上游路径后代理，否则返回接入说明。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleDouyinMarketingActivityQueryGet } from './douyinMerchantGateway.js'

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function bearerToken(req: IncomingMessage): string | null {
  const h = req.headers.authorization
  if (!h || typeof h !== 'string') return null
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  return m?.[1]?.trim() || null
}

async function fetchMeituanMarketingActivities(
  bearer: string,
  url: URL,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const base = process.env.MEITUAN_OPENAPI_BASE_URL?.trim().replace(/\/+$/, '')
  const path =
    process.env.MEITUAN_MARKETING_ACTIVITY_QUERY_PATH?.trim() ||
    '/marketing/activity/query'
  if (!base) {
    return {
      status: 200,
      body: {
        ok: true,
        platform: 'meituan',
        items: [],
        total: 0,
        syncedAt: new Date().toISOString(),
        upstreamNote:
          '美团营销活动列表需在美团技术服务合作中心申请对应业务方案后，配置 MEITUAN_OPENAPI_BASE_URL 与 MEITUAN_MARKETING_ACTIVITY_QUERY_PATH。参见 https://developer.meituan.com/docs/biz',
      },
    }
  }
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('page_size')) || 20))
  const u = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`)
  u.searchParams.set('page', String(page))
  u.searchParams.set('page_size', String(pageSize))
  const dr = await fetch(u.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: 'application/json',
    },
  })
  const raw = await dr.text()
  let j: Record<string, unknown> = {}
  try {
    j = JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    j = { raw: raw.slice(0, 2000) }
  }
  return { status: dr.status, body: { ok: dr.ok, platform: 'meituan', upstream: j } }
}

async function fetchXhsMarketingActivities(
  bearer: string,
  url: URL,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const base = process.env.XHS_OPENAPI_BASE_URL?.trim().replace(/\/+$/, '')
  const path =
    process.env.XHS_MARKETING_ACTIVITY_QUERY_PATH?.trim() || '/api/marketing/activity/list'
  if (!base) {
    return {
      status: 200,
      body: {
        ok: true,
        platform: 'xiaohongshu',
        items: [],
        total: 0,
        syncedAt: new Date().toISOString(),
        upstreamNote:
          '小红书本地生活营销活动需在 open.xiaohongshu.com 申请权限后，配置 XHS_OPENAPI_BASE_URL 与 XHS_MARKETING_ACTIVITY_QUERY_PATH。',
      },
    }
  }
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('page_size')) || 20))
  const u = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`)
  u.searchParams.set('page', String(page))
  u.searchParams.set('page_size', String(pageSize))
  const dr = await fetch(u.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: 'application/json',
    },
  })
  const raw = await dr.text()
  let j: Record<string, unknown> = {}
  try {
    j = JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    j = { raw: raw.slice(0, 2000) }
  }
  return { status: dr.status, body: { ok: dr.ok, platform: 'xiaohongshu', upstream: j } }
}

export async function handleMarketingActivitiesListGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const platform = (url.searchParams.get('platform') ?? 'douyin').trim().toLowerCase()
  if (platform === 'douyin') {
    await handleDouyinMarketingActivityQueryGet(req, res, url)
    return
  }

  const bearer = bearerToken(req)
  if (!bearer) {
    json(res, 401, { ok: false, message: '缺少 Authorization Bearer', platform })
    return
  }

  if (platform === 'meituan') {
    const r = await fetchMeituanMarketingActivities(bearer, url)
    json(res, r.status, r.body)
    return
  }
  if (platform === 'xiaohongshu' || platform === 'xhs') {
    const r = await fetchXhsMarketingActivities(bearer, url)
    json(res, r.status, r.body)
    return
  }

  json(res, 400, { ok: false, message: 'platform 须为 douyin | meituan | xiaohongshu', platform })
}
