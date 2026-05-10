/**
 * Vercel：同源 `/api/merchant/*`（抖音来客、财务对账、评价占位等），与本地 Vite 共用 merchantApiGatewayCore。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createMocks } from 'node-mocks-http'
import { handleMerchantApiGatewayCore } from '../../vite-plugins/merchantApiGatewayCore'

function rawBody(req: VercelRequest): string {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
  return ''
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

  const urlStr = typeof req.url === 'string' ? req.url : ''
  const qIdx = urlStr.indexOf('?')
  const search = qIdx >= 0 ? urlStr.slice(qIdx) : ''
  const pathWithQuery = pathname + search

  const method = (req.method ?? 'GET').toUpperCase()
  const bodyRaw =
    method === 'POST' || method === 'PUT' || method === 'PATCH' ? rawBody(req) : ''

  const { req: mReq, res: mRes } = createMocks<IncomingMessage, ServerResponse>({
    method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS',
    url: pathWithQuery,
    headers: flattenVercelHeaders(req.headers) as Record<string, string>,
    ...(bodyRaw ? { body: bodyRaw as unknown as Record<string, string> } : {}),
  })

  const urlObj = new URL(pathWithQuery, 'http://localhost')

  const consumed = bodyRaw
  const bodyReader = async () => consumed

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
}
