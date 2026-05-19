/**
 * POST /api/meoo-ops-recruitment-schedule-set — 仅覆盖当前租户的排期行（id 带 sch@tenantId@ 前缀）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { requireMerchantRegistryAuth } from '../src/lib/merchantRegistryAuth.js'
import type { RegistryScheduleRow } from '../src/lib/opsRegistryTypes.js'
import { setRecruitmentScheduleRowsForTenant } from '../src/lib/registryTenantIsolation.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'

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

    const auth = await requireMerchantRegistryAuth(req)
    if (!auth.ok) {
      sendOpsJson(res, auth.status, { ok: false, error: auth.error, message: auth.message })
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

    let body: { rows?: RegistryScheduleRow[] }
    try {
      body = JSON.parse(rawBody(req) || '{}') as { rows?: RegistryScheduleRow[] }
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }
    const rows = Array.isArray(body.rows) ? body.rows : []

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const next = setRecruitmentScheduleRowsForTenant(data, auth.tenantId, rows)
    await io.save(next)
    sendOpsJson(res, 200, { ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_recruitment_schedule_set_failed',
      detail: msg.slice(0, 800),
    })
  }
}
