/**
 * POST /api/meoo-ops-mp-recruitment-publish-link-batch-verify — PR 批量 AI 检核达人回传链接（开头画面对比）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { applyBatchVerifyVisitPublishLinks } from '../src/lib/mpRecruitmentVideoCore.js'
import { isIceMpOrder } from '../src/lib/mpRecruitmentIceCore.js'

export const config = { maxDuration: 300 }

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

    let body: { mpOrderId?: string; applicantIds?: string[] }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const mpOrderId = String(body.mpOrderId || '').trim()
    if (!mpOrderId) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_submit' })
      return
    }

    const applicantIds = Array.isArray(body.applicantIds)
      ? body.applicantIds.map((id) => String(id || '').trim()).filter(Boolean)
      : undefined

    const { mergeMerchantAiEnvWithRegistrySnapshot } = await import(
      '../vite-plugins/merchantRegistryVendorEnv.js'
    )
    const aiEnv = await mergeMerchantAiEnvWithRegistrySnapshot(
      process.cwd(),
      process.env as Record<string, string>,
    )

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const idx = data.mpRecruitmentOrders?.findIndex((o) => o.id === mpOrderId) ?? -1
    if (!data.mpRecruitmentOrders || idx < 0) {
      sendOpsJson(res, 404, { ok: false, error: 'not_found' })
      return
    }
    if (isIceMpOrder(data.mpRecruitmentOrders[idx]!)) {
      sendOpsJson(res, 400, { ok: false, error: 'not_visit_order' })
      return
    }

    const result = await applyBatchVerifyVisitPublishLinks(data, mpOrderId, applicantIds, aiEnv)
    if (!result.ok) {
      sendOpsJson(res, result.status, { ok: false, error: 'verify_failed', message: result.error })
      return
    }
    await io.save(data)
    sendOpsJson(res, 200, {
      ok: true,
      message: `已检核 ${result.checked} 条：通过 ${result.passed}，未通过 ${result.failed}`,
      checked: result.checked,
      passed: result.passed,
      failed: result.failed,
      items: result.items,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'publish_link_batch_verify_failed',
      detail: msg.slice(0, 800),
    })
  }
}
