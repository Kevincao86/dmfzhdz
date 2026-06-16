/**
 * GET /api/meoo-ops-mp-hall-registry — 达人招募大厅
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isVercelServerless } from '../src/lib/mpErpRuntime.js'
import { loadMpHallRegistryPayload, slimMpRecruitmentOrdersForHallList } from '../src/lib/mpHallRegistryCore.js'
import type { RegistryMpRecruitmentOrder } from '../src/lib/opsRegistryTypes.js'

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

    const includeRecommendPool =
      String(req.query?.includeRecommendPool || '').trim() === '1' ||
      String(req.query?.includeRecommendPool || '').toLowerCase() === 'true'
    const payload = await loadMpHallRegistryPayload({
      includeRecommendPool,
    })

    if (!payload || typeof payload !== 'object') {
      res.status(502).send(
        JSON.stringify({
          ok: false,
          error: 'meoo_ops_mp_hall_registry_failed',
          detail: 'erp_api_invalid_shape',
        }),
      )
      return
    }
    if (!Array.isArray(payload.mpRecruitmentOrders)) {
      payload.mpRecruitmentOrders = []
    } else {
      payload.mpRecruitmentOrders = slimMpRecruitmentOrdersForHallList(
        payload.mpRecruitmentOrders as RegistryMpRecruitmentOrder[],
      )
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
