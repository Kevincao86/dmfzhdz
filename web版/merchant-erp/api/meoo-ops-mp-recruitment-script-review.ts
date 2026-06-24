/**
 * POST /api/meoo-ops-mp-recruitment-script-review — PR 审核达人文稿并通过/驳回。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { applyScriptReviewToSnapshot } from '../src/lib/mpRecruitmentScriptCore.js'
import { purgeExpiredGroupQrsInSnapshot } from '../src/lib/mpGroupQrCleanup.js'

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

    let body: { mpOrderId?: string; applicantId?: string; action?: string; rejectReason?: string }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const mpOrderId = String(body.mpOrderId || '').trim()
    const applicantId = String(body.applicantId || '').trim()
    const action = String(body.action || '').trim() as 'pass' | 'reject'
    const rejectReason = String(body.rejectReason || '').trim()
    if (!mpOrderId || !applicantId || (action !== 'pass' && action !== 'reject')) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_review' })
      return
    }
    if (action === 'reject' && !rejectReason) {
      sendOpsJson(res, 400, { ok: false, error: 'reject_reason_required' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    purgeExpiredGroupQrsInSnapshot(data)
    const result = applyScriptReviewToSnapshot(data, mpOrderId, applicantId, action, rejectReason)
    if (!result.ok) {
      sendOpsJson(res, result.status, { ok: false, error: result.error })
      return
    }
    await io.save(data)
    sendOpsJson(res, 200, { ok: true, action })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, { ok: false, error: 'script_review_failed', detail: msg.slice(0, 800) })
  }
}
