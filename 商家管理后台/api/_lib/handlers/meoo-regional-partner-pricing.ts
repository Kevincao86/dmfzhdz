import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from '../createOpsServiceRoleClient.js'
import {
  loadPartnerSubscriptionPricing,
  mergeCityPricing,
  platformDefaultTiers,
  savePartnerSubscriptionPricing,
  PLATFORM_SUBSCRIPTION_FLOOR,
} from '../regionalPartnerPricing.js'
import {
  bearerTokenFromAuthHeader,
  requireRegionalPartnerSession,
} from '../regionalPartnersBackend.js'
import { sendOpsJson } from '../safeOpsJson.js'

function rawBody(req: VercelRequest): string {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object')
    return JSON.stringify(req.body)
  return '{}'
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const client = createOpsServiceRoleClient()
  if (!client.ok) {
    sendOpsJson(res, client.status, client.body)
    return
  }

  const token = bearerTokenFromAuthHeader(req.headers.authorization)
  const auth = await requireRegionalPartnerSession(client.admin, token, process.env)
  if (!auth.ok) {
    sendOpsJson(res, auth.status, { ok: false, code: auth.error, message: '未登录或会话已过期' })
    return
  }

  if (!auth.partner.permissions.includes('pricing')) {
    sendOpsJson(res, 403, { ok: false, code: 'forbidden', message: '无区域定价权限' })
    return
  }

  if (req.method === 'GET') {
    const pricing = await loadPartnerSubscriptionPricing(client.admin, auth.partner.id)
    const byCity = auth.partner.cities.map((c) => ({
      province: c.province,
      city: c.city,
      tiers: mergeCityPricing(pricing[c.city] ?? pricing[c.city.replace(/市$/, '')] ?? null),
    }))
    sendOpsJson(res, 200, {
      ok: true,
      cities: auth.partner.cities,
      pricing,
      byCity,
      floors: PLATFORM_SUBSCRIPTION_FLOOR,
      platformDefaults: platformDefaultTiers(),
    })
    return
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    let body: { pricing?: unknown }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendOpsJson(res, 400, { ok: false, message: 'invalid_json' })
      return
    }
    const r = await savePartnerSubscriptionPricing(client.admin, auth.partner, body.pricing ?? {})
    if (!r.ok) {
      const msg =
        r.error === 'below_floor'
          ? `价格不得低于平台底价（${r.detail ?? ''}）`
          : r.error === 'city_out_of_scope'
            ? `城市不在代理范围内：${r.detail ?? ''}`
            : r.error === 'pricing_column_missing'
              ? '数据库尚未升级定价字段，请联系平台'
              : r.error
      sendOpsJson(res, 400, { ok: false, code: r.error, message: msg, detail: r.detail })
      return
    }
    sendOpsJson(res, 200, { ok: true, pricing: r.pricing })
    return
  }

  sendOpsJson(res, 405, { ok: false, message: 'Method Not Allowed' })
}
