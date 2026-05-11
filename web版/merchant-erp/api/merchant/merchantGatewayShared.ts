/**
 * 供 `api/merchant/[...slug].ts` 与顶层兜底路由（如 `api/meoo-douyin-stores.ts`）共用，
 * 避免嵌套动态路由在部分部署环境下未命中 Functions、请求落到 SPA HTML。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createMocks } from 'node-mocks-http'

export function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return '{}'
  } catch {
    return '{}'
  }
}

export function flattenVercelHeaders(
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

export function headersForNodeMocks(
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

export function sendMerchantJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
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

/** @returns true 若已处理 OPTIONS 并应结束 handler */
export function handleMerchantApiOptions(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return true
  }
  return false
}

export async function runMerchantApiGatewayFromPath(
  req: VercelRequest,
  res: VercelResponse,
  pathWithQuery: string,
): Promise<void> {
  const method = (req.method ?? 'GET').toUpperCase()
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
