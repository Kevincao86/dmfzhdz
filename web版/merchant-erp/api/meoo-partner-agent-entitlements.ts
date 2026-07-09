/**
 * GET/PUT /api/meoo-partner-agent-entitlements — 总代分配 / 子代查看权益
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { requireMerchantRegistryAuth } from '../src/lib/merchantRegistryAuth.js'
import {
  assertParentPartnerTenant,
  listPartnerAgentEntitlements,
  upsertPartnerAgentEntitlement,
} from '../src/lib/partnerAgentCore.js'
import { fetchPartnerTenantProfile } from '../src/lib/partnerTenantProfile.js'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { nodeSupabaseClientOptions } from '../src/lib/nodeSupabaseClientOptions.js'

export const config = { maxDuration: 30 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body))
}

function rawBody(req: VercelRequest): Record<string, unknown> {
  try {
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}') as Record<string, unknown>
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}') as Record<string, unknown>
    if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>
  } catch {
    /* ignore */
  }
  return {}
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  const auth = await requireMerchantRegistryAuth(req)
  if (!auth.ok) {
    sendJson(res, auth.status, { ok: false, error: auth.error, message: auth.message })
    return
  }

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length) {
    sendJson(res, 503, { ok: false, error: 'supabase_not_configured', missing: missingParts })
    return
  }

  const admin = createClient(supabaseUrl, serviceRole, nodeSupabaseClientOptions())
  const profile = await fetchPartnerTenantProfile(admin, auth.tenantId)
  if (profile.edition !== 'partner' && profile.edition !== 'partner_agent') {
    sendJson(res, 403, { ok: false, error: 'not_partner', message: '仅服务商版可使用权益分配' })
    return
  }

  if (req.method === 'GET') {
    const rows = await listPartnerAgentEntitlements(admin, auth.tenantId, {
      isParent: profile.isParent,
      isAgent: profile.isAgent,
      parentTenantId: profile.parentTenantId,
    })
    sendJson(res, 200, { ok: true, entitlements: rows })
    return
  }

  if (req.method === 'PUT') {
    const parentCheck = await assertParentPartnerTenant(admin, auth.tenantId)
    if (!parentCheck.ok) {
      sendJson(res, 403, { ok: false, error: parentCheck.error, message: parentCheck.message })
      return
    }
    const body = rawBody(req)
    const agentTenantId = String(body.agentTenantId || '').trim()
    if (!agentTenantId) {
      sendJson(res, 400, { ok: false, error: 'missing_agent', message: '请指定子代租户' })
      return
    }
    const row = await upsertPartnerAgentEntitlement(admin, auth.tenantId, {
      agentTenantId,
      seatLimit: body.seatLimit != null ? Number(body.seatLimit) : undefined,
      packagePointsQuota:
        body.packagePointsQuota != null ? Number(body.packagePointsQuota) : undefined,
      rechargePointsQuota:
        body.rechargePointsQuota != null ? Number(body.rechargePointsQuota) : undefined,
      serviceExpireAt:
        body.serviceExpireAt === null
          ? null
          : typeof body.serviceExpireAt === 'string'
            ? body.serviceExpireAt
            : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
    })
    if (!row) {
      sendJson(res, 400, { ok: false, error: 'upsert_failed', message: '权益分配失败' })
      return
    }
    sendJson(res, 200, { ok: true, entitlement: row })
    return
  }

  sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
}
