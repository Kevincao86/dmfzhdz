import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from './createOpsServiceRoleClient.js'
import { bearerTokenFromAuthHeader, listOpsStaffAccountsPublic, verifyOpsSessionToken } from './opsStaffAccountsBackend.js'
import { sendOpsJson } from './safeOpsJson.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendOpsJson(res, 405, { ok: false, message: 'Method Not Allowed' })
    return
  }

  const token = bearerTokenFromAuthHeader(req.headers.authorization)
  const session = verifyOpsSessionToken(token, process.env)
  if (!session) {
    sendOpsJson(res, 401, { ok: false, message: '未登录或会话已过期' })
    return
  }

  const client = createOpsServiceRoleClient()
  if (!client.ok) {
    sendOpsJson(res, client.status, client.body)
    return
  }

  try {
    const accounts = await listOpsStaffAccountsPublic(client.admin)
    sendOpsJson(res, 200, { ok: true, accounts })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/ops_staff_accounts|does not exist|Could not find|schema cache/i.test(msg)) {
      sendOpsJson(res, 503, {
        ok: false,
        error: 'ops_staff_table_missing',
        hint: '请在 Supabase 执行迁移 20260524120000_ops_staff_accounts.sql',
      })
      return
    }
    sendOpsJson(res, 500, { ok: false, message: msg.slice(0, 400) })
  }
}
