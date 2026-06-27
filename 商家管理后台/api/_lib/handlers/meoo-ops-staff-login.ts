import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from '../createOpsServiceRoleClient.js'
import { sendOpsJson } from '../safeOpsJson.js'
import { verifyOpsStaffLogin } from '../opsStaffAccountsBackend.js'

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

  const phone = String(body.phone ?? '').trim()
  const password = String(body.password ?? '')

  try {
    const r = await verifyOpsStaffLogin(client.admin, phone, password, process.env)
    if (!r.ok) {
      sendOpsJson(res, 401, { ok: false, message: '账号或密码错误', code: r.error })
      return
    }
    sendOpsJson(res, 200, {
      ok: true,
      sessionToken: r.sessionToken,
      session: {
        accountId: r.session.accountId,
        phone: r.session.phone,
        displayName: r.session.displayName,
        role: r.session.role,
        permissions: r.session.permissions,
        loginAt: r.session.loginAt,
      },
      account: r.account,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (
      /ops_staff_accounts|does not exist|Could not find|schema cache|permission denied/i.test(
        msg,
      )
    ) {
      sendOpsJson(res, 503, {
        ok: false,
        code: 'ops_staff_table_missing',
        error: 'ops_staff_table_missing',
        hint: '请在轻量 ECS 执行 bash scripts/ecs-apply-ops-staff-accounts.sh',
        detail: msg.slice(0, 200),
      })
      return
    }
    sendOpsJson(res, 500, {
      ok: false,
      code: 'server_error',
      error: 'server_error',
      message: msg.slice(0, 400),
    })
  }
}
