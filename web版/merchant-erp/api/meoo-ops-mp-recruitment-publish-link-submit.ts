/**
 * POST /api/meoo-ops-mp-recruitment-publish-link-submit — 探店招募：达人回传平台发布链接并 AI 核查后完结。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { applyVisitPublishLinkToSnapshot } from '../src/lib/mpRecruitmentVideoCore.js'
import { isIceMpOrder } from '../src/lib/mpRecruitmentIceCore.js'

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

    let body: { mpOrderId?: string; applicantId?: string; publishUrl?: string; douyinPublishUrl?: string }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const mpOrderId = String(body.mpOrderId || '').trim()
    const applicantId = String(body.applicantId || '').trim()
    const publishUrl = String(body.publishUrl || body.douyinPublishUrl || '').trim()
    if (!mpOrderId || !applicantId || !publishUrl) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_submit' })
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
    if (isIceMpOrder(cur)) {
      sendOpsJson(res, 400, { ok: false, error: 'not_visit_order' })
      return
    }

    const { mergeMerchantAiEnvWithRegistrySnapshot } = await import(
      '../vite-plugins/merchantRegistryVendorEnv.js'
    )
    const aiEnv = await mergeMerchantAiEnvWithRegistrySnapshot(
      process.cwd(),
      process.env as Record<string, string>,
    )
    const result = await applyVisitPublishLinkToSnapshot(
      data,
      mpOrderId,
      applicantId,
      publishUrl,
      aiEnv,
    )
    await io.save(data)
    if (!result.ok) {
      sendOpsJson(res, result.status, { ok: false, error: 'verify_failed', message: result.error })
      return
    }
    sendOpsJson(res, 200, { ok: true, message: 'AI 核查通过，订单已完结' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'publish_link_submit_failed',
      detail: msg.slice(0, 800),
    })
  }
}
