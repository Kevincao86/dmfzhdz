import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from '../createOpsServiceRoleClient.js'
import {
  bearerTokenFromAuthHeader,
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

  sendOpsJson(res, 200, { ok: true, partner: auth.partner })
}
