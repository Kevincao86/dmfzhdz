/**
 * GET/POST /api/meoo-ops-mp-membership-plan-versions — 星选四身份会员权限版本与定价
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  listMembershipPlanVersions,
  type MpLibraryRole,
  type MpMembershipPlanVersion,
} from '../src/lib/mpMembershipCatalog.js'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { saveMembershipPlanVersionsFromSnapshot } from '../src/lib/mpMembershipPlanVersionMutations.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'

export const config = { maxDuration: 60 }

function sendOpsJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function sendCors(res: VercelResponse, methods = 'GET, POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', methods)
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

function parseRole(raw: unknown): MpLibraryRole | null {
  const s = String(raw || '').trim()
  if (s === 'pr' || s === 'talent' || s === 'shoot' || s === 'edit') return s
  return null
}

function publicPlanPayload(role: MpLibraryRole, versions: MpMembershipPlanVersion[]) {
  return {
    ok: true,
    role,
    versions: versions.map((v) => ({
      id: v.id,
      name: v.name,
      priceMonthlyYuan: v.priceMonthlyYuan ?? null,
      priceYearlyYuan: v.priceYearlyYuan ?? null,
      listPriceMonthlyYuan: v.listPriceMonthlyYuan ?? null,
      listPriceYearlyYuan: v.listPriceYearlyYuan ?? null,
      promoEndsAt: v.promoEndsAt ?? null,
      promoBadge: v.promoBadge ?? null,
      giftPointsMonthly: v.giftPointsMonthly ?? null,
      permissions: v.permissions,
      sortOrder: v.sortOrder ?? 0,
      builtin: v.builtin === true,
    })),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    sendCors(res)
    if (req.method === 'OPTIONS') {
      res.status(204).end()
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

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)

    if (req.method === 'GET') {
      const role = parseRole(req.query?.role)
      if (!role) {
        sendOpsJson(res, 400, { ok: false, error: 'invalid_role' })
        return
      }
      const data = await io.load()
      const versions = listMembershipPlanVersions(data, role)
      sendOpsJson(res, 200, publicPlanPayload(role, versions))
      return
    }

    if (req.method !== 'POST') {
      sendOpsJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    let body: { role?: string; versions?: unknown }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const role = parseRole(body.role)
    if (!role) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_role' })
      return
    }

    const data = await io.load()
    const result = saveMembershipPlanVersionsFromSnapshot(data, role, body.versions)
    if (!result.ok) {
      sendOpsJson(res, result.status, { ok: false, error: result.error })
      return
    }
    await io.save(data)
    sendOpsJson(res, 200, { ok: true, role, count: result.count })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_mp_membership_plan_versions_failed',
      detail: msg.slice(0, 800),
    })
  }
}
