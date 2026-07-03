/**
 * POST /api/meoo-mp-applicant-pick-share
 * actions: create | revoke | public_get | upsert_note | list_feedback
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import {
  createApplicantPickShareAdmin,
  handleApplicantPickShareBody,
} from '../src/lib/applicantPickShareHandler.js'

export const config = { maxDuration: 60 }

function sendOpsJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
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

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const admin = createApplicantPickShareAdmin(supabaseUrl, serviceRole)
    const out = await handleApplicantPickShareBody(admin, supabaseUrl, serviceRole, body)
    sendOpsJson(res, out.status, out.data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/mp_applicant_pick_share|does not exist|Could not find/i.test(msg)) {
      sendOpsJson(res, 503, {
        ok: false,
        error: 'applicant_pick_share_table_missing',
        hint: '请执行迁移 20260703120000_mp_applicant_pick_share.sql',
      })
      return
    }
    sendOpsJson(res, 500, { ok: false, error: 'applicant_pick_share_failed', detail: msg.slice(0, 800) })
  }
}
