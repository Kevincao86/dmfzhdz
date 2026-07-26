import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from '../createOpsServiceRoleClient.js'
import {
  bearerTokenFromAuthHeader,
  buildDashboard,
  buildSettlementLines,
  loadPartnerConfirmedOrders,
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
  if (!auth.partner.permissions.includes('settlement')) {
    sendOpsJson(res, 403, { ok: false, code: 'permission_denied', message: '无结算权限' })
    return
  }

  try {
    const merchants = await loadPartnerMerchants(client.admin, auth.partner.id)
    const orders = await loadPartnerConfirmedOrders(
      client.admin,
      merchants.map((m) => m.id),
    )
    sendOpsJson(res, 200, {
      ok: true,
      summary: buildDashboard(auth.partner, merchants, orders),
      lines: buildSettlementLines(auth.partner, merchants, orders),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, { ok: false, code: 'server_error', message: msg.slice(0, 400) })
  }
}
