/**
 * GET /api/meoo-ops-mp-hall-registry — 达人招募大厅专用（仅开放中的 mp 单 + 关联商家单，体积小）。
 * 与全量 meoo-ops-sync-registry 相比，去掉 aiModels / vendorKeys / videoJobs 等，利于微信拉取。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { mpRecruitmentOrdersForTalentHall } from '../src/lib/registryTenantIsolation.js'
import { createRegistrySnapshotIoFetch, loadRegistrySnapshotForGet } from '../src/lib/registrySnapshotIoFetch.js'

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

    const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
    if (missingParts.length > 0) {
      res.status(503).send(
        JSON.stringify({
          ok: false,
          error: 'supabase_admin_not_configured',
          missing: missingParts,
          hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
        }),
      )
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await loadRegistrySnapshotForGet(io)
    const mpRecruitmentOrders = mpRecruitmentOrdersForTalentHall(data)
    const refIds = new Set(
      mpRecruitmentOrders.map((o) => String(o.sourceMerchantOrderId || '').trim()).filter(Boolean),
    )
    const recruitmentOrders = (data.recruitmentOrders ?? []).filter(
      (o) => o && refIds.has(String(o.id || '')),
    )

    const mpTalentInbox = (data.mpTalentInbox ?? []).slice(0, 400)
    const mpTalentMembers = data.mpTalentMembers ?? []

    res.status(200).send(
      JSON.stringify({
        ok: true,
        mpRecruitmentOrders,
        recruitmentOrders,
        recruitmentScheduleRows: [],
        recruitmentVideoSubmissions: [],
        mpTalentInbox,
        mpTalentMembers,
      }),
    )
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
