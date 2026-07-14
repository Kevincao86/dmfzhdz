/**
 * GET/POST /api/meoo-distribution-affiliate-portal
 * 登录用户查看个人推广码、钱包与结算摘要；POST action=wxacode 生成太阳码
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { resolveAffiliateAuthIdentity } from '../src/lib/affiliatePortalAuth.js'
import {
  buildAffiliatePortalFromSnapshot,
  buildDistributionPromoLinks,
  createWithdrawRequestFromSnapshot,
} from '../src/lib/distributionRegistryCore.js'
import { generateAffiliatePromoWxacodeDataUrl } from '../src/lib/mpAffiliateWxacode.js'
import { buildAffiliateAttributionsFromSnapshot } from '../src/lib/distributionAttributionCore.js'
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
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mp-Session')
      res.status(204).end()
      return
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
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

    if (req.method === 'POST') {
      const body = rawBody(req)
      const action = String(body.action || '').trim()

      if (action === 'withdraw') {
        if (!portal.affiliate || portal.affiliate.status !== 'active') {
          sendJson(res, 403, {
            ok: false,
            error: 'affiliate_not_active',
            message: '推广员审核通过后才可申请提现',
          })
          return
        }
        const created = createWithdrawRequestFromSnapshot(data, identity, body)
        if (!created.ok) {
          sendJson(res, created.status, {
            ok: false,
            error: created.error,
            message: created.message || created.error,
          })
          return
        }
        await io.save(data)
        const refreshed = buildAffiliatePortalFromSnapshot(data, identity)
        sendJson(res, 200, {
          ok: true,
          request: created.request,
          wallet: refreshed.ok ? refreshed.wallet : portal.wallet,
          stats: refreshed.ok ? refreshed.stats : portal.stats,
          withdrawRequests: refreshed.ok ? refreshed.withdrawRequests : [],
          withdrawGate: refreshed.ok ? refreshed.withdrawGate : portal.withdrawGate,
        })
        return
      }

      if (action !== 'wxacode') {
        sendJson(res, 400, { ok: false, error: 'unknown_action' })
        return
      }
      if (!portal.affiliate || portal.affiliate.status !== 'active' || !refCode) {
        sendJson(res, 403, { ok: false, error: 'affiliate_not_active', message: '推广员审核通过后才可生成太阳码' })
        return
      }
      try {
        const dataUrl = await generateAffiliatePromoWxacodeDataUrl(refCode)
        sendJson(res, 200, { ok: true, refCode, dataUrl, source: 'wechat_wxacode' })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const status = msg === 'wx_not_configured' ? 503 : 500
        const code = msg === 'wx_not_configured' ? msg : 'wxacode_unavailable'
        const zh =
          msg === 'wx_not_configured'
            ? '小程序码服务未配置，请联系管理员'
            : /invalid page|page not found|41030/i.test(msg)
              ? '小程序页面未发布，请稍后重试或联系管理员'
              : /access_token|40001|42001/i.test(msg)
                ? '微信授权失效，请稍后重试'
                : '太阳码生成失败，请稍后重试'
        sendJson(res, status, { ok: false, error: code, message: zh, detail: msg.slice(0, 200) })
      }
      return
    }

    const promoLinks =
      portal.affiliate && portal.affiliate.status === 'active' && refCode
        ? buildDistributionPromoLinks(refCode)
        : null

    const affiliateId =
      portal.affiliate && typeof portal.affiliate.id === 'string' ? portal.affiliate.id.trim() : ''
    const attributionBundle =
      affiliateId && portal.affiliate?.status === 'active'
        ? buildAffiliateAttributionsFromSnapshot(data, affiliateId)
        : null

    sendJson(res, 200, {
      ok: true,
      affiliate: portal.affiliate,
      wallet: portal.wallet,
      stats: portal.stats,
      settlements: portal.settlements,
      promoLinks,
      attributionStats: attributionBundle?.stats ?? null,
      attributions: attributionBundle?.attributions ?? [],
      withdrawGate: portal.withdrawGate,
      withdrawRequests: portal.withdrawRequests,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    sendJson(res, 500, { ok: false, error: 'internal_error', message: message.slice(0, 400) })
  }
}
