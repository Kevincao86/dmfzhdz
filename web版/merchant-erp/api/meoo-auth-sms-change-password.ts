/**
 * POST /api/meoo-auth-sms-change-password
 * 已登录：手机号须与当前账号一致 + 短信验证码 → 更新 Supabase 登录密码
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyBearerJwt } from '../vite-plugins/aiGateway/authSupabase.js'
import { normalizeCnMobile } from '../vite-plugins/authRegistrationOtp.js'
import {
  phoneFromUserRecord,
  verifyRegisterSmsCode,
} from '../vite-plugins/authSmsAuthShared.js'
import {
  readMerchantSupabaseAdminEnv,
  supabaseAdminFetch,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'

export const config = { maxDuration: 60 }

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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
    const auth = String(req.headers.authorization || '')
    const session = await verifyBearerJwt(auth, process.env as Record<string, string>)
    if (!session?.id) {
      sendJson(res, 401, { ok: false, error: 'unauthorized', message: '请先登录' })
      return
    }

    const body = JSON.parse(rawBody(req) || '{}') as {
      phone?: string
      smsCode?: string
      newPassword?: string
    }
    const phone = normalizeCnMobile(body.phone ?? '')
    const smsCode = String(body.smsCode ?? '').trim()
    const newPassword = String(body.newPassword ?? '')

    if (!phone) {
      sendJson(res, 400, { ok: false, error: 'invalid_phone', message: '请输入有效大陆手机号' })
      return
    }
    if (!/^\d{6}$/.test(smsCode)) {
      sendJson(res, 400, { ok: false, error: 'invalid_sms_code', message: '请输入 6 位验证码' })
      return
    }
    if (newPassword.length < 6) {
      sendJson(res, 400, { ok: false, error: 'invalid_password', message: '新密码至少 6 位' })
      return
    }

    const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
    if (missingParts.length > 0) {
      sendJson(res, 503, {
        ok: false,
        error: 'supabase_admin_not_configured',
        message: '认证服务未配置',
        missing: missingParts,
      })
      return
    }

    const base = supabaseUrl.replace(/\/$/, '')
    const userRes = await supabaseAdminFetch(`${base}/auth/v1/admin/users/${session.id}`, {
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
    })
    const userText = await userRes.text()
    if (!userRes.ok) {
      sendJson(res, 502, {
        ok: false,
        error: 'user_lookup_failed',
        message: '无法读取当前账号信息',
        detail: userText.slice(0, 200),
      })
      return
    }
    let userJson: Record<string, unknown> = {}
    try {
      userJson = JSON.parse(userText) as Record<string, unknown>
    } catch {
      sendJson(res, 502, { ok: false, error: 'user_parse_failed', message: '账号信息解析失败' })
      return
    }
    const accountPhone = phoneFromUserRecord(userJson) || ''
    if (!accountPhone) {
      sendJson(res, 400, {
        ok: false,
        error: 'account_phone_missing',
        message: '当前账号未绑定手机号，请联系管理员',
      })
      return
    }
    if (phone !== accountPhone) {
      sendJson(res, 400, {
        ok: false,
        error: 'phone_mismatch',
        message: '手机号须与当前登录账号一致',
      })
      return
    }
    if (!(await verifyRegisterSmsCode(phone, smsCode))) {
      sendJson(res, 400, { ok: false, error: 'sms_code_invalid', message: '验证码错误或已过期' })
      return
    }

    const upd = await supabaseAdminFetch(`${base}/auth/v1/admin/users/${session.id}`, {
      method: 'PUT',
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword }),
    })
    const updText = await upd.text()
    if (!upd.ok) {
      sendJson(res, 502, {
        ok: false,
        error: 'password_update_failed',
        message: '密码更新失败，请稍后重试',
        detail: updText.slice(0, 300),
      })
      return
    }

    sendJson(res, 200, { ok: true, message: '密码已更新，下次登录请使用新密码' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendJson(res, 500, { ok: false, error: 'internal_error', message: msg.slice(0, 200) })
  }
}
