/**
 * GET /api/meoo-ops-mp-publisher-display?mpOrderId= — 分享海报发单方名称（GET 便于云函数多路重试）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { resolvePublisherDisplayForMpOrder } from '../src/lib/mpHallRegistryCore.js'

export const config = { maxDuration: 30 }

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

    const mpOrderId = String(req.query?.mpOrderId || req.query?.orderId || '').trim()
    if (!mpOrderId) {
      res.status(400).send(JSON.stringify({ ok: false, error: 'missing_mp_order_id' }))
      return
    }

    const { supabaseUrl, serviceRole } = readMerchantSupabaseAdminEnv()
    const result = await resolvePublisherDisplayForMpOrder(mpOrderId, supabaseUrl, serviceRole)
    res.status(200).send(
      JSON.stringify({
        ok: result.ok,
        mpOrderId: result.mpOrderId,
        displayName: result.displayName,
        prUser: result.prUser,
      }),
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).send(JSON.stringify({ ok: false, error: 'publisher_display_failed', detail: msg.slice(0, 400) }))
  }
}
