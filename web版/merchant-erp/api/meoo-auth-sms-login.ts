/**
 * POST /api/meoo-auth-sms-login — 手机号 + 短信验证码登录（阿里云或本地 OTP）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { normalizeCnMobile } from '../vite-plugins/authRegistrationOtp.js'
import {
  createAdminSessionForUserId,
  findAuthUserByPhone,
  verifyAuthSmsCode,
} from '../vite-plugins/authSmsAuthShared.js'

export const config = { maxDuration: 60 }

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  cors(res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return '{}'
  } catch {
    return '{}'
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  cors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  try {
    const body = JSON.parse(rawBody(req) || '{}') as { phone?: string; smsCode?: string }
    const phone = normalizeCnMobile(body.phone ?? '')
    const smsCode = String(body.smsCode ?? '').trim()

    if (!phone) {
      sendJson(res, 400, { ok: false, error: 'invalid_phone', message: '请输入有效大陆手机号' })
      return
    }
    if (!/^\d{6}$/.test(smsCode)) {
      sendJson(res, 400, { ok: false, error: 'invalid_sms_code', message: '请输入 6 位验证码' })
      return
    }
    if (!(await verifyAuthSmsCode(phone, smsCode))) {
      sendJson(res, 400, { ok: false, error: 'sms_code_invalid', message: '验证码错误或已过期' })
      return
    }

    const user = await findAuthUserByPhone(phone)
    if (!user) {
      sendJson(res, 404, {
        ok: false,
        error: 'phone_not_registered',
        message: '该手机号尚未注册，请先注册',
      })
      return
    }

    const session = await createAdminSessionForUserId(user.userId, user.email)
    if (!session.ok) {
      const status = session.error === 'supabase_admin_not_configured' ? 503 : 500
      sendJson(res, status, {
        ok: false,
        error: session.error,
        message: '登录服务暂不可用，请稍后重试',
        detail: session.detail,
      })
      return
    }

    sendJson(res, 200, {
      ok: true,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      loginName: user.loginName,
    })
  } catch (e) {
    sendJson(res, 500, {
      ok: false,
      error: 'sms_login_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}
