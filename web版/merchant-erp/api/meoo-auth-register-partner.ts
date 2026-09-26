/**
 * POST /api/meoo-auth-register-partner — 服务商版自助注册
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  isValidLoginName,
  isValidMerchantShortName,
  normalizeCnMobile,
} from '../vite-plugins/authRegistrationOtp.js'
import { provisionMerchantTenant } from '../vite-plugins/authRegisterProvision.js'
import { phoneAlreadyRegistered, verifyRegisterSmsCode } from '../vite-plugins/authSmsAuthShared.js'
import {
  findAuthUserByBindEmail,
  normalizeBindEmail,
  verifyAuthEmailCode,
} from '../vite-plugins/authIdentityBindCore.js'

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
      partnerName?: string
      merchantName?: string
      phone?: string
      smsCode?: string
      email?: string
      emailCode?: string
      password?: string
      confirmPassword?: string
    }
    const loginName = (body.loginName ?? '').trim()
    const partnerName = (body.partnerName ?? body.merchantName ?? '').trim()
    const phone = normalizeCnMobile(body.phone ?? '')
    const smsCode = String(body.smsCode ?? '').trim()
    const email = normalizeBindEmail(body.email ?? '')
    const emailCode = String(body.emailCode ?? '').trim()
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
    if (!isValidMerchantShortName(partnerName)) {
      sendJson(res, 400, {
        ok: false,
        error: 'invalid_partner_name',
        message: '服务商简称 2–30 字，可含汉字',
      })
      return
    }
    if (phone) {
      if (!/^\d{6}$/.test(smsCode)) {
        sendJson(res, 400, { ok: false, error: 'invalid_sms_code', message: '请输入 6 位验证码' })
        return
      }
      if (!(await verifyRegisterSmsCode(phone, smsCode))) {
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
    } else if (email) {
      if (!/^\d{6}$/.test(emailCode)) {
        sendJson(res, 400, { ok: false, error: 'invalid_email_code', message: '请输入 6 位邮箱验证码' })
        return
      }
      if (!verifyAuthEmailCode(email, emailCode)) {
        sendJson(res, 400, { ok: false, error: 'email_code_invalid', message: '邮箱验证码错误或已过期' })
        return
      }
      if (await findAuthUserByBindEmail(email)) {
        sendJson(res, 409, {
          ok: false,
          error: 'email_exists',
          message: '该邮箱已注册，请直接登录',
        })
        return
      }
    } else {
      sendJson(res, 400, { ok: false, error: 'invalid_contact', message: '请使用手机号或邮箱完成验证' })
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

    const result = await provisionMerchantTenant({
      loginName,
      password,
      merchantName: partnerName,
      phone: phone || undefined,
      bindEmail: email || undefined,
      trialDays: 0,
      edition: 'partner',
    })
    if (!result.ok) {
      const status = result.error === 'login_exists' ? 409 : 400
      sendJson(res, status, {
        ok: false,
        error: result.error,
        message: result.error === 'login_exists' ? '该登录名已被注册' : '注册失败，请稍后重试',
        detail: result.detail,
      })
      return
    }
    sendJson(res, 200, {
      ok: true,
      message: '服务商账号注册成功，请登录',
      tenantId: result.tenantId,
    })
  } catch (e) {
    sendJson(res, 500, {
      ok: false,
      error: 'register_failed',
      message: '注册失败，请稍后重试',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}
