/**
 * POST /api/meoo-ops-mp-group-qr-purge — 清理报名截止已满 7 天的招募群二维码（registry）
 * ECS 定时：bash scripts/ecs-cron-mp-group-qr-purge.sh
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { maybePurgeExpiredGroupQrsAndSave } from '../src/lib/mpGroupQrCleanup.js'

export const config = { maxDuration: 60 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(status).send(JSON.stringify(body))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) {
    sendJson(res, 503, {
      ok: false,
      error: 'supabase_admin_not_configured',
      missing: missingParts,
      hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
    })
    return
  }

  try {
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const result = await maybePurgeExpiredGroupQrsAndSave(io)
    sendJson(res, 200, {
      ok: true,
      saved: result.saved,
      purgedOrders: result.purgedOrderIds.length,
      purgedInbox: result.purgedInboxCount,
      orderIds: result.purgedOrderIds.slice(0, 50),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendJson(res, 500, {
      ok: false,
      error: 'mp_group_qr_purge_failed',
      detail: msg.slice(0, 800),
    })
  }
}
