/**
 * POST /api/meoo-ops-mp-calendar-reminder
 * - ECS：handleMpCalendarReminderBody（Postgres 提醒表）
 * - Vercel：代拉 ECS
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { proxyPostErpApi } from '../src/lib/mpErpApiProxy.js'
import { isVercelServerless } from '../src/lib/mpErpRuntime.js'
import { createMpAuthRest, resolveSession } from '../src/lib/mpAccountAuth.js'
import {
  handleMpCalendarReminderBody,
  ownerFromMpAccount,
  type MpCalendarReminderBody,
} from '../src/lib/mpCalendarReminderCore.js'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'

export const config = { maxDuration: 60 }

function sendOpsJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mp-Session')
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

function sessionToken(req: VercelRequest): string {
  const mpHdr = req.headers['x-mp-session']
  if (typeof mpHdr === 'string' && mpHdr.trim()) return mpHdr.trim()
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim()
  return ''
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    sendCors(res)
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    if (req.method !== 'POST') {
      sendOpsJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    if (isVercelServerless()) {
      const token = sessionToken(req) || String(body.sessionToken || body.token || '').trim()
      const proxyBody = token ? { ...body, sessionToken: token } : body
      const out = await proxyPostErpApi('/api/meoo-ops-mp-calendar-reminder', proxyBody)
      sendOpsJson(res, out.status, out.data)
      return
    }

    const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
    if (missingParts.length > 0) {
      sendOpsJson(res, 503, {
        ok: false,
        error: 'supabase_admin_not_configured',
        missing: missingParts,
        hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
      })
      return
    }

    const rest = createMpAuthRest(supabaseUrl, serviceRole)
    const token = sessionToken(req) || String(body.sessionToken || body.token || '').trim()
    const session = token ? await resolveSession(rest, token) : null
    if (!session?.account) {
      sendOpsJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }

    const auth = ownerFromMpAccount(session.account)
    if (!auth) {
      sendOpsJson(res, 400, { ok: false, error: 'missing_owner_identity' })
      return
    }

    const out = await handleMpCalendarReminderBody(body as MpCalendarReminderBody, auth)
    sendOpsJson(res, out.status, out.data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, isVercelServerless() ? 503 : 500, {
      ok: false,
      error: 'meoo_ops_mp_calendar_reminder_failed',
      detail: msg.slice(0, 800),
    })
  }
}
