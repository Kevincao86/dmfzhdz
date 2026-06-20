/**
 * POST /api/meoo-local-promotion-oauth-exchange — 巨量 OAuth 授权码换票 / 刷新 token
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runLocalPromotionOAuthExchange } from './localPromotionOAuthExchangeCore.js'

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

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(status).send(JSON.stringify(body))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'method_not_allowed' })
    return
  }

  try {
    const result = await runLocalPromotionOAuthExchange(rawBody(req))
    sendJson(res, result.statusCode, result.body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendJson(res, 500, { ok: false, message: msg.slice(0, 500) || 'OAuth 换票异常' })
  }
}
