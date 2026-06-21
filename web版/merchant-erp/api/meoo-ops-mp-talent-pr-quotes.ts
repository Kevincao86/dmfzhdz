/**
 * 达人专属 PR 报价：GET 列表 / POST upsert|delete
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createMpAuthRest, resolveSession } from '../src/lib/mpAccountAuth.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import {
  deleteMemberExclusiveQuote,
  listMemberExclusiveQuotes,
  upsertMemberExclusiveQuote,
} from '../src/lib/mpTalentPrQuoteMutations.js'

export const config = { maxDuration: 60 }

function sendOpsJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
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
    const token = sessionToken(req)
    const session = token ? await resolveSession(rest, token) : null
    if (!session?.account) {
      sendOpsJson(res, 401, { ok: false, error: 'login_required' })
      return
    }
    if (session.account.active_role !== 'talent') {
      sendOpsJson(res, 403, { ok: false, error: 'talent_only' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()

    if (req.method === 'GET') {
      const quotes = listMemberExclusiveQuotes(data, session.account)
      sendOpsJson(res, 200, { ok: true, quotes })
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

    const action = String(body.action || 'upsert').trim()
    if (action === 'delete') {
      const result = deleteMemberExclusiveQuote(data, session.account, {
        prLingqiId: String(body.prLingqiId || ''),
        platform: String(body.platform || ''),
      })
      if (!result.ok) {
        sendOpsJson(res, 400, { ok: false, error: result.error })
        return
      }
      await io.save(data)
      sendOpsJson(res, 200, { ok: true, quotes: result.quotes })
      return
    }

    const result = upsertMemberExclusiveQuote(data, session.account, {
      prLingqiId: String(body.prLingqiId || ''),
      prRegistryId: String(body.prRegistryId || '').trim() || undefined,
      prDisplayName: String(body.prDisplayName || '').trim() || undefined,
      platform: String(body.platform || 'douyin'),
      quoteYuan: Number(body.quoteYuan),
      note: String(body.note || '').trim() || undefined,
    })
    if (!result.ok) {
      sendOpsJson(res, 400, { ok: false, error: result.error })
      return
    }
    await io.save(data)
    sendOpsJson(res, 200, { ok: true, quotes: result.quotes })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_mp_talent_pr_quotes_failed',
      detail: msg.slice(0, 800),
    })
  }
}
