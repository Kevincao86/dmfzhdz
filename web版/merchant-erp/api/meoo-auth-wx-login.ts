/**
 * POST /api/meoo-auth-wx-login — 商家 ERP 小程序微信一键登录
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  signInWithWxLoginCode,
  wxLoginErrorMessage,
} from '../vite-plugins/authWxLoginShared.js'

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
      code?: string
      stableDevOpenId?: string
      wxNickName?: string
      wxAvatarUrl?: string
    }
    const out = await signInWithWxLoginCode({
      code: String(body.code ?? ''),
      stableDevOpenId: typeof body.stableDevOpenId === 'string' ? body.stableDevOpenId : undefined,
      wxNickName: typeof body.wxNickName === 'string' ? body.wxNickName : undefined,
      wxAvatarUrl: typeof body.wxAvatarUrl === 'string' ? body.wxAvatarUrl : undefined,
    })
    if (!out.ok) {
      const status =
        out.error === 'wx_not_configured'
          ? 503
          : out.error === 'wx_openid_already_bound'
            ? 409
            : 400
      sendJson(res, status, {
        ok: false,
        error: out.error,
        message: out.message || wxLoginErrorMessage(out.error, out.detail),
        detail: out.detail,
      })
      return
    }
    sendJson(res, 200, {
      ok: true,
      access_token: out.access_token,
      refresh_token: out.refresh_token,
      expires_in: out.expires_in,
      loginName: out.loginName,
      isNew: out.isNew,
    })
  } catch (e) {
    sendJson(res, 500, {
      ok: false,
      error: 'wx_login_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}
