/**
 * Vercel：同源 `/api/merchant/*`（抖音来客、财务对账、评价占位等），与本地 Vite 共用 merchantApiGatewayCore。
 *
 * 注意：不要在文件顶层静态 import `merchantApiGatewayCore`。
 * 该模块会同步拖入整份 douyinMerchantGateway、merchantAiUpstream、视频网关等，Serverless 冷启动易内存/初始化超时，
 * 在尚未写入响应前就崩溃 → 前端只看到 `FUNCTION_INVOCATION_FAILED`。
 * `POST /api/merchant/douyin/bind` 优先动态 import `../douyin-bind`（单文件实现）；其余路由再动态加载 gateway。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createMocks } from 'node-mocks-http'

export const config = { maxDuration: 60 }

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return '{}'
  } catch {
    return '{}'
  }
}

function flattenVercelHeaders(
  h: VercelRequest['headers'],
): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {}
  if (!h) return out
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined) continue
    out[k] = v
  }
  return out
}

/** node-mocks-http / IncomingMessage 侧惯例为小写头名；否则 Authorization 可能读不到 Bearer */
function headersForNodeMocks(
  h: Record<string, string | string[] | undefined>,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined) continue
    const key = k.toLowerCase()
    out[key] = Array.isArray(v) ? v.join(', ') : v
  }
  return out
}

/** 部分边缘/代理会把 req.url 写成绝对 URL，startsWith('/api/') 会失败 → slug 为空 → 网关 404 */
function pathOnlyFromRequestUrl(url: string): string {
  const raw = url.split('?')[0] ?? ''
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      return new URL(raw).pathname
    } catch {
      return raw
    }
  }
  return raw
}

function slugSegmentsFromRequest(req: VercelRequest): string[] {
  const slug = req.query.slug
  if (Array.isArray(slug)) return slug.map(String).filter(Boolean)
  if (typeof slug === 'string' && slug.trim()) return slug.split('/').filter(Boolean)
  const url = typeof req.url === 'string' ? req.url : ''
  const pathOnly = pathOnlyFromRequestUrl(url)
  const prefix = '/api/merchant/'
  if (pathOnly.startsWith(prefix)) {
    const rest = pathOnly.slice(prefix.length)
    return rest ? rest.split('/').filter(Boolean) : []
  }
  return []
}

function sendMerchantJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  try {
    if (res.writableEnded) return
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(status).send(JSON.stringify(body))
  } catch {
    try {
      if (!res.writableEnded) res.end()
    } catch {
      /* noop */
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return
  }

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
  const rawPathOnly = pathOnlyFromRequestUrl(urlStr).replace(/\/+$/, '') ?? ''
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

  const bodyRaw =
    method === 'POST' || method === 'PUT' || method === 'PATCH' ? rawBody(req) : ''

  const { handleMerchantApiGatewayCore } = await import('../../vite-plugins/merchantApiGatewayCore.js')

  const { req: mReq, res: mRes } = createMocks<IncomingMessage, ServerResponse>({
    method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS',
    url: pathWithQuery,
    headers: headersForNodeMocks(flattenVercelHeaders(req.headers)) as Record<string, string>,
    ...(bodyRaw ? { body: bodyRaw as unknown as Record<string, string> } : {}),
  })

  const urlObj = new URL(pathWithQuery, 'http://localhost')

  const consumed = bodyRaw
  const bodyReader = async () => consumed

  try {
    const handled = await handleMerchantApiGatewayCore({
      method,
      pathname: urlObj.pathname,
      url: urlObj,
      req: mReq as unknown as IncomingMessage,
      res: mRes as unknown as ServerResponse,
      env: process.env as Record<string, string>,
      viteRoot: process.cwd(),
      bodyReader,
    })

    if (!handled) {
      res.status(404).setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ message: 'Not Found' }))
      return
    }

    const status = mRes._getStatusCode()
    const hdrs = mRes._getHeaders()
    const ct = hdrs?.['content-type'] ?? hdrs?.['Content-Type']
    if (typeof ct === 'string') res.setHeader('Content-Type', ct)

    const data = mRes._getData()
    if (Buffer.isBuffer(data)) {
      res.status(status).send(data)
      return
    }
    res.status(status).send(data ?? '')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendMerchantJson(res, 500, {
      message: 'merchant_api_gateway_failed',
      detail: msg.slice(0, 800),
    })
  }
}
