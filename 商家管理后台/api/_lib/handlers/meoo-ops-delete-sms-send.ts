/**
 * POST /api/meoo-ops-delete-sms-send — 运营台删除确认：向超级管理员手机发送验证码
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  bearerTokenFromAuthHeader,
  verifyOpsSessionToken,
} from '../opsStaffAccountsBackend.js'
import { OPS_DELETE_CONFIRM_PHONE, sendOpsDeleteConfirmSms } from '../opsDeleteSmsGate.js'
import { sendOpsJson } from '../safeOpsJson.js'

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendOpsJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  const token = bearerTokenFromAuthHeader(
    typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined,
  )
  if (!token || !verifyOpsSessionToken(token, process.env)) {
    sendOpsJson(res, 401, { ok: false, error: 'login_required', message: '请先登录运营管控台' })
    return
  }

  const r = await sendOpsDeleteConfirmSms()
  if (!r.ok) {
    sendOpsJson(res, 503, {
      ok: false,
      error: r.error,
      message: r.message ?? '验证码发送失败',
    })
    return
  }

  sendOpsJson(res, 200, {
    ok: true,
    message: r.message,
    phoneMasked: `${OPS_DELETE_CONFIRM_PHONE.slice(0, 3)}****${OPS_DELETE_CONFIRM_PHONE.slice(-4)}`,
    ...(r.devCode ? { devCode: r.devCode } : {}),
  })
}
