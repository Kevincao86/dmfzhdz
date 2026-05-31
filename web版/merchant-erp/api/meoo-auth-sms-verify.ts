/**
 * POST /api/meoo-auth-sms-verify — 仅核验短信验证码（供 ECS 注册/登录委托 Vercel Aliyun 核验）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { normalizeCnMobile } from '../vite-plugins/authRegistrationOtp.js'
import { verifyAuthSmsCode } from '../vite-plugins/authSmsAuthShared.js'

export const config = { maxDuration: 30 }

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Meoo-Internal-Auth')
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

function internalAuthOk(req: VercelRequest): boolean {
  const secret = (process.env.MEOO_AUTH_INTERNAL_SECRET ?? '').trim()
  if (!secret) return true
  const header = req.headers['x-meoo-internal-auth']
  const got = Array.isArray(header) ? header[0] : header
  return typeof got === 'string' && got.trim() === secret
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
  if (!internalAuthOk(req)) {
    sendJson(res, 403, { ok: false, error: 'forbidden' })
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

    const valid = await verifyAuthSmsCode(phone, smsCode, undefined, { skipRemoteFallback: true })
    if (!valid) {
      sendJson(res, 200, { ok: false, error: 'sms_code_invalid', message: '验证码错误或已过期' })
      return
    }
    sendJson(res, 200, { ok: true })
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    sendJson(res, 500, { ok: false, error: 'sms_verify_failed', message: detail, detail })
  }
}
