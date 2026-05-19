/**
 * POST /api/meoo-ops-recruitment-orders-append — 与 `/api/ops-sync/recruitment-orders/append` 行为一致，
 * 将订单追加写入 Supabase `ops_registry_snapshot`，避免线上仅部署扁平 meoo 函数时达人招募推送 404。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { requireMerchantRegistryAuth } from '../src/lib/merchantRegistryAuth.js'
import type { RegistryRecruitmentOrder } from '../src/lib/opsRegistryTypes.js'
import { appendRecruitmentOrderForTenant } from '../src/lib/registryTenantIsolation.js'
import { recruitmentOrderBelongsToTenant } from '../src/lib/tenantRegistryScope.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'

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
    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    if (req.method !== 'POST') {
      sendOpsJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

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

    let body: { order?: RegistryRecruitmentOrder }
    try {
      body = JSON.parse(rawBody(req) || '{}') as { order?: RegistryRecruitmentOrder }
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }
    const auth = await requireMerchantRegistryAuth(req)
    if (!auth.ok) {
      sendOpsJson(res, auth.status, {
        ok: false,
        error: auth.error,
        message: auth.message,
      })
      return
    }

    const order = body.order
    if (!order || !order.id || !order.customerName) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_order' })
      return
    }

    const reqTid = typeof order.tenantId === 'string' ? order.tenantId.trim() : ''
    if (reqTid && reqTid !== auth.tenantId) {
      sendOpsJson(res, 403, { ok: false, error: 'tenant_mismatch' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const existing = (data.recruitmentOrders ?? []).find((o) => o.id === order.id)
    if (existing && !recruitmentOrderBelongsToTenant(existing, auth.tenantId)) {
      sendOpsJson(res, 403, { ok: false, error: 'forbidden_order' })
      return
    }

    const next = appendRecruitmentOrderForTenant(data, order, auth.tenantId, auth.userId)
    await io.save(next)
    sendOpsJson(res, 200, { ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_recruitment_orders_append_failed',
      detail: msg.slice(0, 800),
    })
  }
}
