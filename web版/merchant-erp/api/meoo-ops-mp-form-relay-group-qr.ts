/**
 * GET /api/meoo-ops-mp-form-relay-group-qr?mpOrderId= — 读取招募单群码（PG side map，PR/转发单通用）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { resolveFormRelayGroupQrForMpOrder } from '../src/lib/mpHallRegistryCore.js'
import { readMpGroupQrSideMapViaPg } from '../src/lib/registrySnapshotPgAppend.js'

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

    const mpOrderId = String(req.query?.mpOrderId || req.query?.orderId || req.query?.id || '').trim()
    if (!mpOrderId) {
      res.status(400).send(JSON.stringify({ ok: false, error: 'missing_mp_order_id' }))
      return
    }

    const pg = await readMpGroupQrSideMapViaPg(mpOrderId)
    if (pg.ok) {
      res.status(200).send(
        JSON.stringify({
          ok: true,
          mpOrderId,
          title: '',
          groupQrImage: pg.groupQrImage,
          via: 'pg_side_map',
        }),
      )
      return
    }

    const { supabaseUrl, serviceRole } = readMerchantSupabaseAdminEnv()
    const result = await resolveFormRelayGroupQrForMpOrder(mpOrderId, supabaseUrl, serviceRole)
    if (!result.ok) {
      res.status(result.status).send(JSON.stringify({ ok: false, error: result.error, mpOrderId }))
      return
    }
    res.status(200).send(
      JSON.stringify({
        ok: true,
        mpOrderId: result.mpOrderId,
        title: result.title,
        groupQrImage: result.groupQrImage,
        via: result.via,
      }),
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res
      .status(500)
      .send(JSON.stringify({ ok: false, error: 'form_relay_group_qr_failed', detail: msg.slice(0, 400) }))
  }
}
