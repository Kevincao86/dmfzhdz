/**
 * Vercel：同源 `/api/merchant/*`（抖音来客、财务对账、评价占位等），与本地 Vite 共用 merchantApiGatewayCore。
 *
 * 注意：不要在文件顶层静态 import `merchantApiGatewayCore`。
 * 该模块会同步拖入整份 douyinMerchantGateway、merchantAiUpstream、视频网关等，Serverless 冷启动易内存/初始化超时，
 * 在尚未写入响应前就崩溃 → 前端只看到 `FUNCTION_INVOCATION_FAILED`。
 * `POST /api/merchant/douyin/bind` 优先动态 import `../douyin-bind`（单文件实现）；其余路由再动态加载 gateway。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  rawBody,
  runMerchantApiGatewayFromPath,
  sendMerchantJson,
} from './merchantGatewayShared.js'

export const config = { maxDuration: 60 }

function slugSegmentsFromRequest(req: VercelRequest): string[] {
  const slug = req.query.slug
  if (Array.isArray(slug)) return slug.map(String).filter(Boolean)
  if (typeof slug === 'string' && slug.trim()) return slug.split('/').filter(Boolean)
  const url = typeof req.url === 'string' ? req.url : ''
  const pathOnly = url.split('?')[0] ?? ''
  const prefix = '/api/merchant/'
  if (pathOnly.startsWith(prefix)) {
    const rest = pathOnly.slice(prefix.length)
    return rest ? rest.split('/').filter(Boolean) : []
  }
  return []
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return

  res.setHeader('Access-Control-Allow-Origin', '*')

  const parts = slugSegmentsFromRequest(req)
  const pathname = '/api/merchant/' + parts.join('/')
  const slugPath = parts.join('/')

  const urlStr = typeof req.url === 'string' ? req.url : ''
  const qIdx = urlStr.indexOf('?')
  const search = qIdx >= 0 ? urlStr.slice(qIdx) : ''
  const pathWithQuery = pathname + search

  const method = (req.method ?? 'GET').toUpperCase()
  /** 部分环境下 req.query.slug 异常，仅靠 slugPath 会误判进入大包网关 → OOM / FUNCTION_INVOCATION_FAILED */
  const rawPathOnly = urlStr.split('?')[0]?.replace(/\/+$/, '') ?? ''
  const isDouyinBindPost =
    method === 'POST' &&
    (slugPath === 'douyin/bind' ||
      rawPathOnly === '/api/merchant/douyin/bind' ||
      rawPathOnly.endsWith('/api/merchant/douyin/bind'))

  if (isDouyinBindPost) {
    try {
      const { runDouyinMerchantBind } = await import('../douyin-bind.js')
      const bodyRaw = rawBody(req)
      const r = await runDouyinMerchantBind(bodyRaw)
      let payload: string
      try {
        payload = JSON.stringify(r.body)
      } catch {
        payload = JSON.stringify({ message: '绑定结果无法序列化为 JSON' })
      }
      if (!res.writableEnded) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.status(r.statusCode).send(payload)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      sendMerchantJson(res, 500, { message: msg || '抖音绑定处理异常' })
    }
    return
  }

  await runMerchantApiGatewayFromPath(req, res, pathWithQuery)
}
