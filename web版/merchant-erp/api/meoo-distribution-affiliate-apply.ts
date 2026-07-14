/**
 * POST /api/meoo-distribution-affiliate-apply — 个人分销员申请（公开，登录态会绑定账号）
 * GET  /api/meoo-distribution-affiliate-apply?phone= — 按手机号查询（公开）
 * GET  /api/meoo-distribution-affiliate-apply + Authorization — 按当前登录账号查询
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { resolveAffiliateAuthIdentity } from '../src/lib/affiliatePortalAuth.js'
import {
  applyAffiliateFromSnapshot,
  lookupAffiliateByPhoneFromSnapshot,
  publicAffiliateSummary,
  resolveAffiliateIdentityFromSnapshot,
} from '../src/lib/distributionRegistryCore.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'

export const config = { maxDuration: 30 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mp-Session')
  res.status(status).send(JSON.stringify(body))
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
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mp-Session')
      res.status(204).end()
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

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const env = process.env as Record<string, string>

    if (req.method === 'GET') {
      const identity = await resolveAffiliateAuthIdentity(req, env)
      if (identity?.authUserId || identity?.phone) {
        const affiliate = resolveAffiliateIdentityFromSnapshot(data, identity)
        sendJson(res, 200, {
          ok: true,
          affiliate: affiliate ? publicAffiliateSummary(affiliate) : null,
        })
        return
      }
      const phone = String(req.query.phone || '')
      const r = lookupAffiliateByPhoneFromSnapshot(data, phone)
      if (!r.ok) {
        sendJson(res, r.status, { ok: false, error: r.error })
        return
      }
      sendJson(res, 200, {
        ok: true,
        affiliate: r.affiliate ? publicAffiliateSummary(r.affiliate) : null,
      })
      return
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const identity = await resolveAffiliateAuthIdentity(req, env)
    if (identity?.authUserId) body.authUserId = identity.authUserId
    if (identity?.phone && !body.phone) body.phone = identity.phone

    const result = applyAffiliateFromSnapshot(data, body)
    if (!result.ok) {
      sendJson(res, result.status, {
        ok: false,
        error: result.error,
        ...(result.affiliate ? { affiliate: publicAffiliateSummary(result.affiliate) } : {}),
      })
      return
    }

    await io.save(data)
    sendJson(res, 200, {
      ok: true,
      created: result.created,
      affiliate: publicAffiliateSummary(result.affiliate),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    sendJson(res, 500, { ok: false, error: 'internal_error', message: message.slice(0, 400) })
  }
}
