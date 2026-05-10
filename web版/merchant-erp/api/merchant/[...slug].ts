/**
 * Vercel：同源 `/api/merchant/*`（抖音来客、财务对账、评价占位等），与本地 Vite 共用 merchantApiGatewayCore。
 *
 * 注意：不要在文件顶层静态 import `merchantApiGatewayCore`。
 * 该模块会同步拖入整份 douyinMerchantGateway、merchantAiUpstream、视频网关等，Serverless 冷启动易内存/初始化超时，
 * 在尚未写入响应前就崩溃 → 前端只看到 `FUNCTION_INVOCATION_FAILED`。
 * `POST /api/merchant/douyin/bind` 在下方优先用动态 import 仅加载 `./douyin/bindRuntime`；其余路由再动态加载 gateway。
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

  const slug = req.query.slug
  const parts = Array.isArray(slug) ? slug : slug ? [slug] : []
  const pathname = '/api/merchant/' + parts.join('/')
  const slugPath = parts.join('/')

  const urlStr = typeof req.url === 'string' ? req.url : ''
  const qIdx = urlStr.indexOf('?')
  const search = qIdx >= 0 ? urlStr.slice(qIdx) : ''
  const pathWithQuery = pathname + search

  const method = (req.method ?? 'GET').toUpperCase()

  if (method === 'POST' && slugPath === 'douyin/bind') {
    try {
      const { runDouyinMerchantBind } = await import('./douyin/bindRuntime')
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

  const { handleMerchantApiGatewayCore } = await import('../../vite-plugins/merchantApiGatewayCore')

  const { req: mReq, res: mRes } = createMocks<IncomingMessage, ServerResponse>({
    method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS',
    url: pathWithQuery,
    headers: flattenVercelHeaders(req.headers) as Record<string, string>,
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
