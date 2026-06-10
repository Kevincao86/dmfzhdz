/**
 * POST /api/meoo-ops-mp-recruitment-orders-apply — 达人招募小程序报名。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import type { RegistryMpRecruitmentApplicant } from '../src/lib/opsRegistryTypes.js'
import { applyToMpRecruitmentOrderInSnapshot } from '../src/lib/mpRecruitmentApplyCore.js'
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

    let body: { mpOrderId?: string; applicant?: RegistryMpRecruitmentApplicant }
    try {
      body = JSON.parse(rawBody(req) || '{}') as { mpOrderId?: string; applicant?: RegistryMpRecruitmentApplicant }
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }
    const mpOrderId = (body.mpOrderId ?? '').trim()
    const applicant = body.applicant
    const nick = (applicant?.platformNickname || applicant?.name || '').trim()
    if (!mpOrderId || !applicant || !applicant.id || !nick) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_apply' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const result = applyToMpRecruitmentOrderInSnapshot(data, mpOrderId, applicant)
    if (!result.ok) {
      sendOpsJson(res, result.status, {
        ok: false,
        error: result.error,
        code: result.code,
        message: result.message,
      })
      return
    }
    await io.save(result.data)
    sendOpsJson(res, 200, result.body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_mp_recruitment_orders_apply_failed',
      detail: msg.slice(0, 800),
    })
  }
}
