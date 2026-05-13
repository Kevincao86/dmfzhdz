/**
 * POST /api/meoo-ops-sync-tenants-erp — 与运营台 `/api/ops-sync/tenants/erp` 行为一致，写入 Supabase ops_registry_snapshot。
 * 解决线上 ERP 同源部署时 `/api/ops-sync/*` 无 Vercel 函数导致的 404（见 OpsRegistryBridge → pushErpTenant）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import type { RegistryTenant } from '../src/lib/opsRegistryTypes.js'
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

    let body: { tenant?: RegistryTenant }
    try {
      body = JSON.parse(rawBody(req) || '{}') as { tenant?: RegistryTenant }
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }
    const tenant = body.tenant
    if (!tenant || !tenant.id || !tenant.loginName) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_tenant' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const nextTenants = data.tenants.filter((t) => t.id !== tenant.id)
    nextTenants.push({
      ...tenant,
      source: 'erp',
      updatedAt: new Date().toISOString(),
    })
    data.tenants = nextTenants
    await io.save(data)
    sendOpsJson(res, 200, { ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_sync_tenants_erp_failed',
      detail: msg.slice(0, 800),
    })
  }
}
