/**
 * POST /api/meoo-ops-mp-recruitment-ice-confirm — 闭环云剪：达人确认接收或拒绝任务。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { handleIceMpConfirm, isIceMpOrder } from '../src/lib/mpRecruitmentIceCore.js'
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

    let body: { mpOrderId?: string; applicantId?: string; action?: 'confirm' | 'reject' }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }
    const mpOrderId = (body.mpOrderId ?? '').trim()
    const applicantId = (body.applicantId ?? '').trim()
    const action = body.action === 'reject' ? 'reject' : 'confirm'
    if (!mpOrderId || !applicantId) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_confirm' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const idx = data.mpRecruitmentOrders?.findIndex((o) => o.id === mpOrderId) ?? -1
    if (!data.mpRecruitmentOrders || idx < 0) {
      sendOpsJson(res, 404, { ok: false, error: 'not_found' })
      return
    }
    const cur = data.mpRecruitmentOrders[idx]!
    if (!isIceMpOrder(cur)) {
      sendOpsJson(res, 400, { ok: false, error: 'not_ice_order' })
      return
    }

    const result = handleIceMpConfirm(cur, applicantId, action)
    if (!result.ok) {
      sendOpsJson(res, 409, { ok: false, error: result.code ?? 'confirm_failed', message: result.error })
      return
    }
    data.mpRecruitmentOrders[idx] = result.mp
    await io.save(data)
    sendOpsJson(res, 200, result.body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_mp_recruitment_ice_confirm_failed',
      detail: msg.slice(0, 800),
    })
  }
}
