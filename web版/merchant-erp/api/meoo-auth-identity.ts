/**
 * POST /api/meoo-auth-identity
 * action: email_send | email_login | identities | bind_contact | merge_confirm
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  bindContactToCurrentUser,
  confirmAccountMerge,
  identitiesFromUser,
  loginWithEmailCode,
  needsPhoneBindFromUser,
  readAuthUserFromAccessToken,
  sendAuthEmailCode,
} from '../vite-plugins/authIdentityBindCore.js'

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

function bearer(req: VercelRequest): string {
  const h = String(req.headers.authorization || req.headers.Authorization || '')
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m?.[1]?.trim() || ''
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
      action?: string
      email?: string
      phone?: string
      smsCode?: string
      emailCode?: string
      mergeToken?: string
      access_token?: string
    }
    const action = String(body.action || '').trim()
    const token = bearer(req) || String(body.access_token || '').trim()

    if (action === 'email_send') {
      const out = await sendAuthEmailCode(body.email || '')
      if (!out.ok) {
        sendJson(res, 400, { ok: false, error: out.error, message: out.message })
        return
      }
      sendJson(res, 200, { ok: true, message: out.message, ...(out.devCode ? { devCode: out.devCode } : {}) })
      return
    }

    if (action === 'email_login') {
      const out = await loginWithEmailCode({ email: body.email || '', emailCode: body.emailCode || '' })
      if (!out.ok) {
        const status = out.error === 'email_not_registered' ? 404 : 400
        sendJson(res, status, { ok: false, error: out.error, message: out.message })
        return
      }
      sendJson(res, 200, out)
      return
    }

    const user = token ? await readAuthUserFromAccessToken(token) : null
    const userId = user && typeof user.id === 'string' ? user.id : ''

    if (action === 'identities') {
      if (!user) {
        sendJson(res, 401, { ok: false, error: 'unauthorized', message: '请先登录' })
        return
      }
      sendJson(res, 200, {
        ok: true,
        identities: identitiesFromUser(user),
        needsPhoneBind: needsPhoneBindFromUser(user),
      })
      return
    }

    if (action === 'bind_contact') {
      if (!userId) {
        sendJson(res, 401, { ok: false, error: 'unauthorized', message: '请先登录' })
        return
      }
      const out = await bindContactToCurrentUser({
        userId,
        phone: body.phone,
        email: body.email,
        smsCode: body.smsCode,
        emailCode: body.emailCode,
      })
      if (!out.ok) {
        const status = out.error === 'account_exists_merge' ? 409 : 400
        sendJson(res, status, out as unknown as Record<string, unknown>)
        return
      }
      sendJson(res, 200, out as unknown as Record<string, unknown>)
      return
    }

    if (action === 'merge_confirm') {
      const out = await confirmAccountMerge({
        mergeToken: body.mergeToken || '',
        smsCode: body.smsCode,
        emailCode: body.emailCode,
      })
      if (!out.ok) {
        sendJson(res, 400, { ok: false, error: out.error, message: out.message })
        return
      }
      sendJson(res, 200, out as unknown as Record<string, unknown>)
      return
    }

    sendJson(res, 400, { ok: false, error: 'unknown_action', message: '未知操作' })
  } catch (e) {
    sendJson(res, 500, {
      ok: false,
      error: 'identity_failed',
      message: e instanceof Error ? e.message : String(e),
    })
  }
}
