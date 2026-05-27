/**
 * POST /api/meoo-local-promotion-bind-test — 巨量本地推绑定校验（单文件入口，避免 Vercel 加载整包 merchant 网关）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runLocalPromotionBindTest } from './localPromotionBindTestCore.js'

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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return
  }

  res.setHeader('Access-Control-Allow-Origin', '*')

  if (req.method !== 'POST') {
    res.status(405).setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ok: false, message: 'method_not_allowed' }))
    return
  }

  try {
    const result = await runLocalPromotionBindTest(rawBody(req))
    res.status(result.statusCode).setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(result.body))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ok: false, message: msg.slice(0, 500) || '本地推绑定校验异常' }))
  }
}
