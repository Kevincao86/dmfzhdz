import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from '../createOpsServiceRoleClient.js'
import {
  bearerTokenFromAuthHeader,
  changeRegionalPartnerPassword,
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
  if (req.method !== 'POST') {
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

  let body: { oldPassword?: string; newPassword?: string }
  try {
    body = JSON.parse(rawBody(req) || '{}') as typeof body
  } catch {
    sendOpsJson(res, 400, { ok: false, message: 'invalid_json' })
    return
  }

  const r = await changeRegionalPartnerPassword(
    client.admin,
    auth.partner.id,
    String(body.oldPassword ?? ''),
    String(body.newPassword ?? ''),
  )
  if (!r.ok) {
    const msg =
      r.error === 'bad_old_password'
        ? '原密码不正确'
        : r.error === 'password_too_short'
          ? '新密码至少 6 位'
          : r.error
    sendOpsJson(res, 400, { ok: false, code: r.error, message: msg })
    return
  }
  sendOpsJson(res, 200, { ok: true })
}
