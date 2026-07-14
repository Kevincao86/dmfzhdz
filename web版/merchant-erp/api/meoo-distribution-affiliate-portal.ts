/**
 * GET /api/meoo-distribution-affiliate-portal
 * 登录用户（Supabase 或 mp 会话）查看个人推广码、钱包与结算摘要
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { resolveAffiliateAuthIdentity } from '../src/lib/affiliatePortalAuth.js'
import { buildAffiliatePortalFromSnapshot, buildDistributionPromoLinks } from '../src/lib/distributionRegistryCore.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'

export const config = { maxDuration: 30 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mp-Session')
  res.status(status).send(JSON.stringify(body))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mp-Session')
      res.status(204).end()
      return
    }

    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    const env = process.env as Record<string, string>
    const identity = await resolveAffiliateAuthIdentity(req, env)
    if (!identity?.authUserId && !identity?.phone) {
      sendJson(res, 401, {
        ok: false,
        error: 'unauthorized',
        message: '请先登录后再查看推广中心',
      })
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
    const portal = buildAffiliatePortalFromSnapshot(data, identity)
    if (!portal.ok) {
      sendJson(res, portal.status, { ok: false, error: portal.error })
      return
    }

    const refCode =
      portal.affiliate && typeof portal.affiliate.refCode === 'string'
        ? portal.affiliate.refCode.trim()
        : ''
    const promoLinks =
      portal.affiliate && portal.affiliate.status === 'active' && refCode
        ? buildDistributionPromoLinks(refCode)
        : null

    sendJson(res, 200, {
      ok: true,
      affiliate: portal.affiliate,
      wallet: portal.wallet,
      stats: portal.stats,
      settlements: portal.settlements,
      promoLinks,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    sendJson(res, 500, { ok: false, error: 'internal_error', message: message.slice(0, 400) })
  }
}
