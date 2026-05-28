/**
 * POST /api/meoo-ops-mp-pr-user-register — 达人招募小程序 PR 资料入库。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import type { RegistryMpPrUser } from '../src/lib/opsRegistryTypes.js'
import { upsertMpPrUser } from '../src/lib/mpPrUserUpsert.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'

export const config = { maxDuration: 60 }

function sendOpsJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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

    let body: { prUser?: RegistryMpPrUser }
    try {
      body = JSON.parse(rawBody(req) || '{}') as { prUser?: RegistryMpPrUser }
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }
    const prUser = body.prUser
    if (!prUser || !prUser.accountType) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_pr_user' })
      return
    }
    const org =
      prUser.accountType === 'personal'
        ? String(prUser.personalName || '').trim()
        : String(prUser.companyName || '').trim()
    if (!org) {
      sendOpsJson(res, 400, { ok: false, error: 'org_required' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const saved = upsertMpPrUser(data, prUser)
    await io.save(data)
    sendOpsJson(res, 200, {
      ok: true,
      id: saved.id,
      lingqiPrId: saved.lingqiPrId,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_mp_pr_user_register_failed',
      detail: msg.slice(0, 800),
    })
  }
}
