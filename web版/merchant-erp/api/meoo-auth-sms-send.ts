/**
 * POST /api/meoo-auth-sms-send — 发送手机验证码（注册 / 登录）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { normalizeCnMobile } from '../vite-plugins/authRegistrationOtp.js'
import { sendAuthSmsCode } from '../vite-plugins/authSmsAuthShared.js'

export const config = { maxDuration: 30 }

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
    const body = JSON.parse(rawBody(req) || '{}') as { phone?: string }
    const phone = normalizeCnMobile(body.phone ?? '')
    if (!phone) {
      sendJson(res, 400, { ok: false, error: 'invalid_phone', message: '请输入有效大陆手机号' })
      return
    }

    const isRelay = String(req.headers['x-meoo-sms-relay'] ?? '').trim() === '1'
    const sms = await sendAuthSmsCode(phone, undefined, { skipPublicRelay: isRelay })
    if (!sms.ok) {
      sendJson(res, 503, {
        ok: false,
        error: sms.error,
        message: sms.message ?? '验证码发送失败',
        detail: sms.message,
      })
      return
    }
    const exposeDev =
      !!sms.devCode &&
      (process.env.MEOO_SMS_DEV_EXPOSE === '1' || process.env.VERCEL_ENV !== 'production')
    sendJson(res, 200, {
      ok: true,
      message: sms.message,
      ...(exposeDev ? { devCode: sms.devCode } : {}),
    })
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    sendJson(res, 500, {
      ok: false,
      error: 'sms_send_failed',
      message: detail,
      detail,
    })
  }
}
