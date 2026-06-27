/**
 * POST /api/meoo-ops-mp-library-features — 运营台：PR/达人库 增值服务与推荐大厅（单条或批量）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import {
  batchPatchLibraryFeatureAccessFromSnapshot,
  patchPrUserFeatureAccessFromSnapshot,
  patchSupplierTeamFeatureAccessFromSnapshot,
  patchTalentLibraryFeatureAccessFromSnapshot,
  readTalentLibraryFeatureAccess,
} from '../src/lib/mpLibraryRegistryMutations.js'
import { resolvePrFeatureAccess } from '../src/lib/prFeatureAccess.js'

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

function readPatch(body: Record<string, unknown>): {
  addons?: boolean
  recommendHall?: boolean
  membershipPlan?: 'basic' | 'pro' | 'flagship' | 'enterprise' | string
} {
  const patch: {
    addons?: boolean
    recommendHall?: boolean
    membershipPlan?: string
  } = {}
  if (typeof body.addons === 'boolean') patch.addons = body.addons
  if (typeof body.recommendHall === 'boolean') patch.recommendHall = body.recommendHall
  const plan = String(body.membershipPlan ?? '').trim().toLowerCase()
  if (plan === 'basic' || plan === 'pro' || plan === 'flagship' || plan === 'enterprise') {
    patch.membershipPlan = plan
  } else if (/^[a-z][a-z0-9_]*$/i.test(plan)) {
    patch.membershipPlan = plan
  }
  return patch
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

    let body: {
      kind?: string
      id?: string
      addons?: boolean
      recommendHall?: boolean
      membershipPlan?: string
      rows?: unknown
    }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const kind =
      body.kind === 'talent'
        ? 'talent'
        : body.kind === 'pr'
          ? 'pr'
          : body.kind === 'shoot'
            ? 'shoot'
            : body.kind === 'edit'
              ? 'edit'
              : null
    if (!kind) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_kind' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()

    if (Array.isArray(body.rows) && body.rows.length) {
      if (kind === 'shoot' || kind === 'edit') {
        sendOpsJson(res, 400, { ok: false, error: 'batch_not_supported_for_kind', kind })
        return
      }
      const result = batchPatchLibraryFeatureAccessFromSnapshot(data, kind, body.rows)
      if (!result.ok) {
        sendOpsJson(res, result.status, { ok: false, error: result.error })
        return
      }
      await io.save(data)
      sendOpsJson(res, 200, {
        ok: true,
        kind,
        updatedCount: result.updatedCount,
        skippedIds: result.skippedIds,
      })
      return
    }

    const patch = readPatch(body as Record<string, unknown>)
    if (!Object.keys(patch).length) {
      sendOpsJson(res, 400, { ok: false, error: 'no_patch_fields' })
      return
    }

    if (kind === 'pr') {
      const result = patchPrUserFeatureAccessFromSnapshot(data, body.id, patch)
      if (!result.ok) {
        sendOpsJson(res, result.status, { ok: false, error: result.error })
        return
      }
      await io.save(data)
      sendOpsJson(res, 200, {
        ok: true,
        kind,
        id: result.user.id,
        lingqiPrId: result.user.lingqiPrId,
        mpMembershipPlan: result.user.mpMembershipPlan ?? 'basic',
        mpFeatureAccess: resolvePrFeatureAccess(result.user),
        prFeatureAccess: resolvePrFeatureAccess(result.user),
      })
      return
    }

    if (kind === 'shoot' || kind === 'edit') {
      const result = patchSupplierTeamFeatureAccessFromSnapshot(data, kind, body.id, patch)
      if (!result.ok) {
        sendOpsJson(res, result.status, { ok: false, error: result.error })
        return
      }
      await io.save(data)
      sendOpsJson(res, 200, {
        ok: true,
        kind,
        id: result.member.id,
        mpMembershipPlan: result.member.mpMembershipPlan ?? 'basic',
        mpFeatureAccess: resolvePrFeatureAccess({ prFeatureAccess: result.member.mpFeatureAccess }),
      })
      return
    }

    const result = patchTalentLibraryFeatureAccessFromSnapshot(data, body.id, patch)
    if (!result.ok) {
      sendOpsJson(res, result.status, { ok: false, error: result.error })
      return
    }
    await io.save(data)
    const access = readTalentLibraryFeatureAccess(result.entry, data.mpTalentMembers ?? [])
    sendOpsJson(res, 200, {
      ok: true,
      kind,
      id: result.entry.id,
      lingqiTalentId: result.entry.lingqiTalentId,
      mpMembershipPlan: result.entry.mpMembershipPlan ?? 'basic',
      mpFeatureAccess: access,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_mp_library_features_failed',
      detail: msg.slice(0, 800),
    })
  }
}
