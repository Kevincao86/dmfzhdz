/**
 * GET /api/meoo-ops-mp-hall-registry — Vercel 根 api（与 web版/merchant-erp 同源逻辑）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isVercelServerless } from '../web版/merchant-erp/src/lib/mpErpRuntime.js'
import { loadMpHallRegistryPayload } from '../web版/merchant-erp/src/lib/mpHallRegistryCore.js'

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

    const payload = await loadMpHallRegistryPayload()

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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const viaProxy = isVercelServerless() && /ecs_proxy|erp_api_proxy|ECONNRESET/i.test(msg)
    res.status(viaProxy ? 503 : 500).send(
      JSON.stringify({
        ok: false,
        error: 'meoo_ops_mp_hall_registry_failed',
        detail: viaProxy ? `ecs_proxy: ${msg.slice(0, 400)}` : msg.slice(0, 800),
      }),
    )
  }
}
