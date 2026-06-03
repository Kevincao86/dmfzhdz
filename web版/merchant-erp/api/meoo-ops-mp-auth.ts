/**
 * POST/GET /api/meoo-ops-mp-auth — 达人/PR 统一登录（微信 code、账号密码、扫码票据）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import {
  accountToClientPayload,
  createMpAuthRest,
  mpAuthPasswordLogin,
  mpAuthScanConfirmDev,
  mpAuthScanCreate,
  mpAuthScanPoll,
  mpAuthSetPassword,
  mpAuthSwitchRole,
  mpAuthWxLogin,
  resolveSession,
} from '../src/lib/mpAccountAuth.js'

export const config = { maxDuration: 60 }

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mp-Session')
}

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  sendCors(res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return ''
  } catch {
    return ''
  }
}

function sessionToken(req: VercelRequest, body: Record<string, unknown>): string {
  const h = req.headers['x-mp-session'] || req.headers.authorization
  if (typeof h === 'string' && h.startsWith('Bearer ')) return h.slice(7).trim()
  return String(body.sessionToken || body.token || '').trim()
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  sendCors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) {
    sendJson(res, 503, {
      ok: false,
      error: 'supabase_admin_not_configured',
      missing: missingParts,
      hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
    })
    return
  }

  const queryAction = String(req.query?.action || '').trim()
  let body: Record<string, unknown> = {}
  if (req.method === 'POST') {
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }
  }
  const action = String(body.action || queryAction || '').trim()
  const rest = createMpAuthRest(supabaseUrl, serviceRole)

  try {
    if (action === 'wx_login') {
      const { token, account, isNew } = await mpAuthWxLogin(supabaseUrl, serviceRole, {
        code: String(body.code || ''),
        role: body.role === 'pr' ? 'pr' : 'talent',
        wxNickName: String(body.wxNickName || ''),
        wxAvatarUrl: String(body.wxAvatarUrl || ''),
        registerTalent: body.registerTalent as never,
        registerPr: body.registerPr as never,
      })
      sendJson(res, 200, { ok: true, token, isNew, account: accountToClientPayload(account) })
      return
    }

    if (action === 'password_login') {
      const { token, account } = await mpAuthPasswordLogin(
        supabaseUrl,
        serviceRole,
        String(body.loginName || ''),
        String(body.password || ''),
      )
      sendJson(res, 200, { ok: true, token, account: accountToClientPayload(account) })
      return
    }

    if (action === 'set_password') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      await mpAuthSetPassword(
        supabaseUrl,
        serviceRole,
        sess.account.id,
        String(body.loginName || ''),
        String(body.password || ''),
      )
      sendJson(res, 200, { ok: true })
      return
    }

    if (action === 'switch_role') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      const account = await mpAuthSwitchRole(
        supabaseUrl,
        serviceRole,
        sess.account.id,
        body.role === 'pr' ? 'pr' : 'talent',
      )
      sendJson(res, 200, { ok: true, account: accountToClientPayload(account) })
      return
    }

    if (action === 'session') {
      const token = sessionToken(req, body)
      const sess = await resolveSession(rest, token)
      if (!sess) {
        sendJson(res, 401, { ok: false, error: 'invalid_session' })
        return
      }
      sendJson(res, 200, { ok: true, account: accountToClientPayload(sess.account) })
      return
    }

    if (action === 'scan_create') {
      const scan = await mpAuthScanCreate(supabaseUrl, serviceRole)
      sendJson(res, 200, { ok: true, ...scan })
      return
    }

    if (action === 'scan_poll') {
      const ticket = String(body.ticket || req.query?.ticket || '')
      const out = await mpAuthScanPoll(supabaseUrl, serviceRole, ticket)
      sendJson(res, 200, { ok: true, ...out })
      return
    }

    if (action === 'scan_confirm_dev') {
      if (process.env.MP_AUTH_DEV_MODE !== 'true') {
        sendJson(res, 403, { ok: false, error: 'dev_only' })
        return
      }
      const { token, account } = await mpAuthScanConfirmDev(
        supabaseUrl,
        serviceRole,
        String(body.ticket || ''),
        String(body.code || ''),
      )
      sendJson(res, 200, { ok: true, token, account: accountToClientPayload(account) })
      return
    }

    sendJson(res, 400, {
      ok: false,
      error: 'unknown_action',
      actions: [
        'wx_login',
        'password_login',
        'set_password',
        'switch_role',
        'session',
        'scan_create',
        'scan_poll',
        'scan_confirm_dev',
      ],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status =
      msg === 'invalid_credentials' ||
      msg === 'account_already_exists' ||
      msg === 'wx_already_registered' ||
      msg === 'login_name_taken'
        ? 400
        : msg === 'wx_not_configured'
          ? 503
          : 500
    sendJson(res, status, { ok: false, error: msg })
  }
}
