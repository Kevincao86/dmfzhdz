/**
 * POST /api/meoo-ops-mp-visit-schedule-confirm — 达人确认档期意向 / 确认探店排期。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import {
  findMpOrderIndex,
  talentAcceptSelectionOnMp,
  talentConfirmAssignmentOnMp,
} from '../src/lib/mpRecruitmentVisitScheduleCore.js'

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

    let body: {
      mpOrderId?: string
      applicantId?: string
      action?: 'accept_selection' | 'confirm_assignment' | 'decline_assignment'
      reason?: string
      visitDate?: string
      visitTimeSlot?: string
    }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const mpOrderId = String(body.mpOrderId || '').trim()
    const applicantId = String(body.applicantId || '').trim()
    const action = body.action || 'accept_selection'
    if (!mpOrderId || !applicantId) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_confirm' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const idx = findMpOrderIndex(data, mpOrderId)
    if (!data.mpRecruitmentOrders || idx < 0) {
      sendOpsJson(res, 404, { ok: false, error: 'not_found' })
      return
    }
    const cur = data.mpRecruitmentOrders[idx]!

    let result:
      | ReturnType<typeof talentAcceptSelectionOnMp>
      | ReturnType<typeof talentConfirmAssignmentOnMp>
    if (action === 'confirm_assignment') {
      result = talentConfirmAssignmentOnMp(cur, applicantId, 'confirm')
    } else if (action === 'decline_assignment') {
      result = talentConfirmAssignmentOnMp(cur, applicantId, 'decline', body.reason)
    } else {
      result = talentAcceptSelectionOnMp(cur, applicantId, {
        visitDate: body.visitDate,
        visitTimeSlot: body.visitTimeSlot,
      })
    }

    if (!result.ok) {
      sendOpsJson(res, 409, {
        ok: false,
        error: result.code || 'confirm_failed',
        message: result.error,
      })
      return
    }
    data.mpRecruitmentOrders![idx] = result.mp
    await io.save(data)
    sendOpsJson(res, 200, {
      ok: true,
      action,
      scheduleConfirmedAt:
        action === 'accept_selection'
          ? (result.mp.applicants || []).find((a) => String(a.id) === applicantId)?.scheduleConfirmedAt
          : undefined,
      visitStatus: 'visitStatus' in result ? result.visitStatus : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'visit_schedule_confirm_failed',
      detail: msg.slice(0, 800),
    })
  }
}
