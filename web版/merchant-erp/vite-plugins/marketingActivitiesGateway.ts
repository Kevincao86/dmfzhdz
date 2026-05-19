/**
 * 营销中心：分平台拉取「平台营销活动 / 招商报名」类 OpenAPI 列表。
 * 抖音：goodlife marketing activity query（见 douyinMerchantGateway）
 * 美团 / 小红书：环境变量配置上游路径后代理，否则返回接入说明。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleDouyinMarketingActivityQueryGet } from './douyinMerchantGateway.js'
import { fetchMeituanMarketingActivities } from './meituanMerchantGateway.js'
import { fetchXhsMarketingActivities } from './xhsMerchantGateway.js'

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
