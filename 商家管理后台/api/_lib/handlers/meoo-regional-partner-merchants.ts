import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from '../createOpsServiceRoleClient.js'
import {
  bearerTokenFromAuthHeader,
  loadPartnerMerchants,
  requireRegionalPartnerSession,
} from '../regionalPartnersBackend.js'
import { sendOpsJson } from '../safeOpsJson.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendOpsJson(res, 405, { ok: false, message: 'Method Not Allowed' })
    return
  }

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
  if (!auth.partner.permissions.includes('merchants')) {
    sendOpsJson(res, 403, { ok: false, code: 'permission_denied', message: '无商家列表权限' })
    return
  }

  try {
    const merchants = await loadPartnerMerchants(client.admin, auth.partner.id)
    const now = Date.now()
    sendOpsJson(res, 200, {
      ok: true,
      merchants: merchants.map((m) => {
        const expireMs = m.service_expire_at ? new Date(m.service_expire_at).getTime() : null
        const active =
          m.account_status !== 'disabled' &&
          m.account_status !== 'frozen' &&
          (expireMs == null || expireMs >= now)
        return {
          id: m.id,
          name: m.name,
          accountStatus: m.account_status,
          serviceExpireAt: m.service_expire_at,
          attributionCity: m.attribution_city,
          createdAt: m.created_at,
          openStatus: active ? '开通中' : '已到期/停用',
        }
      }),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, { ok: false, code: 'server_error', message: msg.slice(0, 400) })
  }
}
