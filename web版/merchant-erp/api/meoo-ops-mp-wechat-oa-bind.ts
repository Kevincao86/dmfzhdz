/**
 * POST /api/meoo-ops-mp-wechat-oa-bind — 达人绑定微信服务号（带参二维码）
 * body: { action: 'status' | 'create_ticket', talentMemberId? }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createMpAuthRest, resolveSession } from '../src/lib/mpAccountAuth.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import {
  createWechatOaBindTicketInSnapshot,
  wechatOaBindStatusInSnapshot,
} from '../src/lib/mpWechatOaBindingCore.js'
import { loadWechatOaConfig, normalizeWechatOaApiError } from '../src/lib/mpWechatOfficialAccountConfig.js'

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

    const cfgResult = loadWechatOaConfig()
    if (!cfgResult.ok) {
      sendOpsJson(res, 503, {
        ok: false,
        error: 'wx_oa_not_configured',
        missing: cfgResult.missing,
      })
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

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const action = String(body.action || 'status').trim()
    const rest = createMpAuthRest(supabaseUrl, serviceRole)
    const token = sessionToken(req)
    const session = token ? await resolveSession(rest, token) : null
    if (!session?.account) {
      sendOpsJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }

    const talentMemberId = String(
      body.talentMemberId || session.account.registry_member_id || '',
    ).trim()
    if (!talentMemberId) {
      sendOpsJson(res, 400, { ok: false, error: 'missing_talent_member_id' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()

    if (action === 'status') {
      const status = wechatOaBindStatusInSnapshot(data, talentMemberId)
      sendOpsJson(res, 200, {
        ok: true,
        ...status,
        oaDisplayName: cfgResult.config.displayName,
      })
      return
    }

    if (action === 'create_ticket') {
      const created = await createWechatOaBindTicketInSnapshot(data, talentMemberId)
      if (!created.ok) {
        sendOpsJson(res, created.status, {
          ok: false,
          error: created.error,
          message: (created as { message?: string }).message,
        })
        return
      }
      await io.save(data)
      sendOpsJson(res, 200, {
        ok: true,
        ticket: created.ticket,
        qrUrl: created.qrUrl,
        expiresAt: created.expiresAt,
        oaDisplayName: cfgResult.config.displayName,
      })
      return
    }

    sendOpsJson(res, 400, { ok: false, error: 'invalid_action' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const norm = normalizeWechatOaApiError(msg)
    sendOpsJson(res, norm.code === 'wx_oa_ip_not_whitelisted' ? 503 : 500, {
      ok: false,
      error: norm.code,
      message: norm.message,
      detail: msg.slice(0, 800),
    })
  }
}
