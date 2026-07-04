/**
 * GET /api/meoo-ops-mp-recruitment-orders-list — 运营台小程序招募单列表（仅 mpRecruitmentOrders 切片，含完整 applicants）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { fetchRegistryMpOrdersFromDb } from '../src/lib/mpHallRegistryCore.js'
import type { RegistryMpRecruitmentOrder } from '../src/lib/opsRegistryTypes.js'

export const config = { maxDuration: 60 }

function sendOpsJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  try {
    if (res.writableEnded || res.headersSent) return
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(status).send(JSON.stringify(body))
  } catch {
    try {
      if (!res.writableEnded && !res.headersSent) res.end()
    } catch {
      /* noop */
    }
  }
}

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
      sendOpsJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
    if (missingParts.length > 0) {
      sendOpsJson(res, 503, {
        ok: false,
        error: 'supabase_admin_not_configured',
        missing: missingParts,
        hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
      })
      return
    }

    const partial = await fetchRegistryMpOrdersFromDb(supabaseUrl, serviceRole)
    const mpRecruitmentOrders = Array.isArray(partial.mpRecruitmentOrders)
      ? (partial.mpRecruitmentOrders as RegistryMpRecruitmentOrder[])
      : []

    sendOpsJson(res, 200, { ok: true, mpRecruitmentOrders })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const aborted = e instanceof Error && (e.name === 'AbortError' || /aborted|timeout/i.test(msg))
    sendOpsJson(res, 500, {
      ok: false,
      error: aborted ? 'registry_mp_orders_fetch_timeout' : 'meoo_ops_mp_recruitment_orders_list_failed',
      detail: msg.slice(0, 800),
    })
  }
}
