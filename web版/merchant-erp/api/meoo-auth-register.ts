/**
 * POST /api/meoo-auth-register — 商家自助注册（验证码 + 开通租户）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  isValidLoginName,
  isValidMerchantShortName,
  normalizeCnMobile,
} from '../vite-plugins/authRegistrationOtp.js'
import { provisionMerchantTenant } from '../vite-plugins/authRegisterProvision.js'
import { phoneAlreadyRegistered, verifyAuthSmsCode } from '../vite-plugins/authSmsAuthShared.js'

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
    const body = JSON.parse(rawBody(req) || '{}') as {
      loginName?: string
      merchantName?: string
      phone?: string
      smsCode?: string
      password?: string
      confirmPassword?: string
    }
    const loginName = (body.loginName ?? '').trim()
    const merchantName = (body.merchantName ?? '').trim()
    const phone = normalizeCnMobile(body.phone ?? '')
    const smsCode = String(body.smsCode ?? '').trim()
    const password = body.password ?? ''
    const confirmPassword = body.confirmPassword ?? password

    if (!isValidLoginName(loginName)) {
      sendJson(res, 400, {
        ok: false,
        error: 'invalid_login_name',
        message: '登录名须为 4–32 位字母或数字',
      })
      return
    }
    if (!isValidMerchantShortName(merchantName)) {
      sendJson(res, 400, {
        ok: false,
        error: 'invalid_merchant_name',
        message: '商家简称 2–30 字，可含汉字',
      })
      return
    }
    if (!phone) {
      sendJson(res, 400, { ok: false, error: 'invalid_phone', message: '请输入有效大陆手机号' })
      return
    }
    if (!/^\d{6}$/.test(smsCode)) {
      sendJson(res, 400, { ok: false, error: 'invalid_sms_code', message: '请输入 6 位验证码' })
      return
    }
    if (password.length < 6) {
      sendJson(res, 400, { ok: false, error: 'invalid_password', message: '密码至少 6 位' })
      return
    }
    if (password !== confirmPassword) {
      sendJson(res, 400, { ok: false, error: 'password_mismatch', message: '两次输入的密码不一致' })
      return
    }
    if (!(await verifyAuthSmsCode(phone, smsCode))) {
      sendJson(res, 400, { ok: false, error: 'sms_code_invalid', message: '验证码错误或已过期' })
      return
    }
    if (await phoneAlreadyRegistered(phone)) {
      sendJson(res, 409, {
        ok: false,
        error: 'phone_exists',
        message: '该手机号已注册，请直接登录',
      })
      return
    }

    const result = await provisionMerchantTenant({
      loginName,
      password,
      merchantName,
      phone,
      trialDays: 14,
    })
    if (!result.ok) {
      const status =
        result.error === 'login_exists' ? 409 : result.error === 'supabase_admin_not_configured' ? 503 : 400
      const message =
        result.error === 'login_exists'
          ? '该登录名已被注册'
          : result.error === 'supabase_admin_not_configured'
            ? '注册服务未配置 SUPABASE_SERVICE_ROLE_KEY，请联系管理员'
            : '注册失败，请稍后重试'
      sendJson(res, status, { ok: false, error: result.error, message, detail: result.detail })
      return
    }
    sendJson(res, 200, {
      ok: true,
      message: '注册成功，请使用登录名与密码或手机号验证码登录',
      tenantId: result.tenantId,
    })
  } catch (e) {
    sendJson(res, 500, {
      ok: false,
      error: 'register_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}
