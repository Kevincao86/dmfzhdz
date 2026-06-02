/**
 * POST /api/meoo-ops-mp-support-relay
 * - ECS：handleMpSupportRelayBody
 * - Vercel：代拉 ECS
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { proxyPostErpApi } from '../src/lib/mpErpApiProxy.js'
import { isVercelServerless } from '../src/lib/mpErpRuntime.js'
import { handleMpSupportRelayBody, type MpSupportRelayBody } from '../src/lib/mpSupportRelayHandler.js'

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

    if (isVercelServerless()) {
      const out = await proxyPostErpApi('/api/meoo-ops-mp-support-relay', body)
      sendOpsJson(res, out.status, out.data)
      return
    }

    const out = await handleMpSupportRelayBody(body as MpSupportRelayBody)
    sendOpsJson(res, out.status, out.data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, isVercelServerless() ? 503 : 500, {
      ok: false,
      error: 'meoo_ops_mp_support_relay_failed',
      detail: msg.slice(0, 800),
    })
  }
}
