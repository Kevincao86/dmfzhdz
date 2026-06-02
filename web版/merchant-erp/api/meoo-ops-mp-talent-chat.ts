/**
 * POST /api/meoo-ops-mp-talent-chat — 达人招募私信（Vercel → ECS erp-api）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { proxyPostErpApi } from '../src/lib/mpErpApiProxy.js'

export const config = { maxDuration: 60 }

function sendOpsJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return ''
  } catch {
    return ''
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    sendCors(res)
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    if (req.method !== 'POST') {
      sendOpsJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    try {
      const out = await proxyPostErpApi('/api/meoo-ops-mp-talent-chat', body)
      sendOpsJson(res, out.status, out.data)
    } catch (proxyErr) {
      const proxyMsg = proxyErr instanceof Error ? proxyErr.message : String(proxyErr)
      sendOpsJson(res, 503, {
        ok: false,
        error: 'meoo_ops_mp_talent_chat_failed',
        detail: `ecs_proxy: ${proxyMsg}`.slice(0, 800),
      })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_mp_talent_chat_failed',
      detail: msg.slice(0, 800),
    })
  }
}
