/**
 * GET/POST /api/meoo-partner-salespersons — 服务商 fws：分销员列表、新增/编辑、佣金比例
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { requireMerchantRegistryAuth } from '../src/lib/merchantRegistryAuth.js'
import {
  batchPatchSalespersonCommissionFromSnapshot,
  listPartnerSalespersonsFromSnapshot,
  patchSalespersonCommissionFromSnapshot,
  upsertPartnerSalespersonFromSnapshot,
} from '../src/lib/distributionRegistryCore.js'
import {
  effectivePartnerRates,
  mergeDistributionPolicy,
  type DistributionCommissionOverride,
} from '../src/lib/distributionRegistryTypes.js'
import { sanitizePartnerSalespersonCommissionOverride } from '../src/lib/distributionCommissionDisplay.js'
import { resolvePartnerBillingContext } from '../src/lib/partnerAgentCore.js'
import type { RegistryFile } from '../src/lib/opsRegistryTypes.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { nodeSupabaseClientOptions } from '../src/lib/nodeSupabaseClientOptions.js'

export const config = { maxDuration: 60 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
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

function findPartnerChannel(data: RegistryFile, partnerTenantId: string) {
  return (data.distributionPartnerChannels ?? []).find((p) => p.partnerTenantId === partnerTenantId)
}

function buildCommissionContext(data: RegistryFile, partnerTenantId: string) {
  const policy = mergeDistributionPolicy(data.distributionPolicy)
  const partner = findPartnerChannel(data, partnerTenantId)
  const channelOverride = partner?.commissionOverride ?? null
  const defaults = effectivePartnerRates(policy, channelOverride)
  return {
    policyEnabled: policy.enabled,
    channelOverride,
    defaults,
  }
}

function normalizeSalespersonIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))]
}

function parseCommissionOverrideBody(raw: unknown): DistributionCommissionOverride | null {
  if (raw === null) return null
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return sanitizePartnerSalespersonCommissionOverride(raw as DistributionCommissionOverride)
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
  const partnerCtx = await resolvePartnerBillingContext(admin, auth.tenantId)
  if (!partnerCtx) {
    sendJson(res, 403, {
      ok: false,
      error: 'partner_only',
      message: '仅服务商版可管理分销员',
    })
    return
  }

  const { data: tenantRow } = await admin
    .from('tenants')
    .select('name')
    .eq('id', auth.tenantId)
    .maybeSingle()
  const partnerName =
    typeof tenantRow?.name === 'string' && tenantRow.name.trim()
      ? tenantRow.name.trim()
      : auth.tenantId

  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)

  if (req.method === 'GET') {
    const data = await io.load()
    const salespersons = listPartnerSalespersonsFromSnapshot(data, auth.tenantId)
    const commissionContext = buildCommissionContext(data, auth.tenantId)
    sendJson(res, 200, {
      ok: true,
      partnerTenantId: auth.tenantId,
      partnerName,
      salespersons,
      commissionContext,
    })
    return
  }

  if (req.method === 'POST') {
    const body = rawBody(req)
    const action = String(body.action || 'upsert').trim()
    const data = await io.load()

    if (action === 'patch_commission') {
      const salespersonId = String(body.salespersonId || '').trim()
      if (!salespersonId) {
        sendJson(res, 400, { ok: false, error: 'invalid_salesperson_id' })
        return
      }
      const commissionOverride = parseCommissionOverrideBody(body.commissionOverride)
      const r = patchSalespersonCommissionFromSnapshot(
        data,
        auth.tenantId,
        salespersonId,
        commissionOverride,
        auth.tenantId,
      )
      if (!r.ok) {
        sendJson(res, r.status, { ok: false, error: r.error })
        return
      }
      await io.save(data)
      const salespersons = listPartnerSalespersonsFromSnapshot(data, auth.tenantId)
      sendJson(res, 200, {
        ok: true,
        salespersons,
        commissionContext: buildCommissionContext(data, auth.tenantId),
      })
      return
    }

    if (action === 'batch_patch_commission') {
      const commissionOverride = parseCommissionOverrideBody(body.commissionOverride)
      let ids = normalizeSalespersonIds(body.salespersonIds)
      const applyToAll = body.applyToAll === true || ids.length === 0
      if (applyToAll) {
        const partner = findPartnerChannel(data, auth.tenantId)
        ids = (partner?.salespersons ?? [])
          .filter((s) => s.status === 'active')
          .map((s) => s.id)
      }
      if (!ids.length) {
        sendJson(res, 400, { ok: false, error: 'no_salespersons', message: '没有可调整的分销员' })
        return
      }
      const r = batchPatchSalespersonCommissionFromSnapshot(
        data,
        auth.tenantId,
        ids,
        commissionOverride,
        auth.tenantId,
      )
      if (!r.ok) {
        sendJson(res, r.status, { ok: false, error: r.error })
        return
      }
      await io.save(data)
      const salespersons = listPartnerSalespersonsFromSnapshot(data, auth.tenantId)
      sendJson(res, 200, {
        ok: true,
        updatedCount: r.updatedCount,
        skippedIds: r.skippedIds,
        salespersons,
        commissionContext: buildCommissionContext(data, auth.tenantId),
      })
      return
    }

    const r = upsertPartnerSalespersonFromSnapshot(data, {
      ...body,
      partnerTenantId: auth.tenantId,
      partnerName,
    })
    if (!r.ok) {
      sendJson(res, r.status, { ok: false, error: r.error })
      return
    }
    await io.save(data)
    sendJson(res, 200, { ok: true, salesperson: r.salesperson })
    return
  }

  sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
}
