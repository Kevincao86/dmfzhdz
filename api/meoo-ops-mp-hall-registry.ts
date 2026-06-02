/**
 * GET /api/meoo-ops-mp-hall-registry — 达人招募大厅（Vercel → ECS erp-api）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { proxyGetErpApi } from './mpErpApiProxy.js'

export const config = { maxDuration: 60 }

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    sendCors(res)
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    if (req.method !== 'GET') {
      res.status(405).send(JSON.stringify({ ok: false, error: 'method_not_allowed' }))
      return
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    try {
      const payload = await proxyGetErpApi('/api/meoo-ops-mp-hall-registry')
      if (!payload || !Array.isArray(payload.mpRecruitmentOrders)) {
        res.status(502).send(
          JSON.stringify({
            ok: false,
            error: 'meoo_ops_mp_hall_registry_failed',
            detail: 'erp_api_invalid_shape',
          }),
        )
        return
      }
      res.status(200).send(JSON.stringify(payload))
    } catch (proxyErr) {
      const proxyMsg = proxyErr instanceof Error ? proxyErr.message : String(proxyErr)
      res.status(503).send(
        JSON.stringify({
          ok: false,
          error: 'meoo_ops_mp_hall_registry_failed',
          detail: `ecs_proxy: ${proxyMsg.slice(0, 400)}`,
        }),
      )
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).send(
      JSON.stringify({
        ok: false,
        error: 'meoo_ops_mp_hall_registry_failed',
        detail: msg.slice(0, 800),
      }),
    )
  }
}
