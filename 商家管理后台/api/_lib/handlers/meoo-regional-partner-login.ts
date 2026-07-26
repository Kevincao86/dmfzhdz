import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from '../createOpsServiceRoleClient.js'
import { verifyRegionalPartnerLogin } from '../regionalPartnersBackend.js'
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

  let body: { phone?: string; password?: string }
  try {
    body = JSON.parse(rawBody(req) || '{}') as typeof body
  } catch {
    sendOpsJson(res, 400, { ok: false, message: 'invalid_json' })
    return
  }

  try {
    const r = await verifyRegionalPartnerLogin(
      client.admin,
      String(body.phone ?? ''),
      String(body.password ?? ''),
      process.env,
    )
    if (!r.ok) {
      sendOpsJson(res, 401, { ok: false, message: '账号或密码错误', code: r.error })
      return
    }
    sendOpsJson(res, 200, {
      ok: true,
      sessionToken: r.sessionToken,
      session: {
        partnerId: r.session.partnerId,
        phone: r.session.phone,
        companyName: r.session.companyName,
        permissions: r.session.permissions,
        cities: r.session.cities,
        partnerShareRate: r.session.partnerShareRate,
        platformShareRate: r.session.platformShareRate,
        loginAt: r.session.loginAt,
      },
      partner: r.partner,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/regional_partners|does not exist|schema cache/i.test(msg)) {
      sendOpsJson(res, 503, {
        ok: false,
        code: 'regional_partners_table_missing',
        message: '请在轻量执行 bash scripts/ecs-apply-regional-partners.sh',
        detail: msg.slice(0, 200),
      })
      return
    }
    sendOpsJson(res, 500, { ok: false, code: 'server_error', message: msg.slice(0, 400) })
  }
}
