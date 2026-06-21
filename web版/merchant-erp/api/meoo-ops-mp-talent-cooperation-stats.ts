/**
 * PR 视角：批量查询达人近 N 天合作价统计（最低/最高/平均）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createMpAuthRest, resolveSession } from '../src/lib/mpAccountAuth.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { findRegistryPrForAccount } from '../src/lib/mpRegistryProfileGet.js'
import {
  batchTalentCooperationPriceStats,
  type TalentCooperationStatsQuery,
} from '../src/lib/mpTalentCooperationStatsCore.js'

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
    if (session.account.active_role !== 'pr') {
      sendOpsJson(res, 403, { ok: false, error: 'pr_only' })
      return
    }

    let body: { windowDays?: number; talents?: TalentCooperationStatsQuery[] }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const talents = Array.isArray(body.talents) ? body.talents : []
    if (!talents.length) {
      sendOpsJson(res, 400, { ok: false, error: 'talents_required' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const pr = findRegistryPrForAccount(data, session.account)
    const prLingqiId = String(session.account.lingqi_pr_id || pr?.lingqiPrId || '').trim()
    const prRegistryId = String(session.account.registry_pr_id || pr?.id || '').trim()
    if (!prLingqiId && !prRegistryId) {
      sendOpsJson(res, 400, { ok: false, error: 'pr_not_bound' })
      return
    }

    const orders = data.mpRecruitmentOrders ?? []
    const stats = batchTalentCooperationPriceStats({
      orders,
      prLingqiId,
      prRegistryId,
      talents: talents.slice(0, 80),
      windowDays: body.windowDays,
    })

    sendOpsJson(res, 200, { ok: true, stats, windowDays: body.windowDays ?? 30 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_mp_talent_cooperation_stats_failed',
      detail: msg.slice(0, 800),
    })
  }
}
