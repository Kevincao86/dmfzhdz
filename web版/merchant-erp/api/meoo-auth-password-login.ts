/**
 * POST /api/meoo-auth-password-login — 账户名 + 密码登录（小程序 / 第三方经 ERP 网关）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { signInWithPasswordLoginName } from '../vite-plugins/authSmsAuthShared.js'

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
    const body = JSON.parse(rawBody(req) || '{}') as { loginName?: string; password?: string }
    const result = await signInWithPasswordLoginName(body.loginName ?? '', body.password ?? '')
    if (!result.ok) {
      const status =
        result.error === 'invalid_credentials' || result.error === 'invalid_login_name' || result.error === 'invalid_password'
          ? 400
          : result.error === 'supabase_not_configured'
            ? 503
            : 500
      sendJson(res, status, {
        ok: false,
        error: result.error,
        message: result.message,
        detail: result.detail,
      })
      return
    }
    sendJson(res, 200, {
      ok: true,
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_in: result.expires_in,
      loginName: result.loginName,
    })
  } catch (e) {
    sendJson(res, 500, {
      ok: false,
      error: 'password_login_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}
