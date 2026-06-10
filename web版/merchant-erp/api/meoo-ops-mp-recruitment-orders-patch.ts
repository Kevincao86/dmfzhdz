/**
 * POST /api/meoo-ops-mp-recruitment-orders-patch — 更新小程序招募单（含 PR 编辑整单）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import {
  patchMpRecruitmentOrderInSnapshot,
  type MpRecruitmentPatchBody,
} from '../src/lib/mpRecruitmentOrderRegistryMutations.js'
import { purgeExpiredGroupQrsInSnapshot } from '../src/lib/mpGroupQrCleanup.js'
import {
  notifyAuditPassSubscribe,
  selectedApplicantIdSet,
} from '../src/lib/mpSubscribeMessageSend.js'
import type { RegistryMpRecruitmentOrder } from '../src/lib/opsRegistryTypes.js'

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

    let body: MpRecruitmentPatchBody
    try {
      body = JSON.parse(rawBody(req) || '{}') as MpRecruitmentPatchBody
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    purgeExpiredGroupQrsInSnapshot(data)
    const patchId = String(body.id || body.order?.id || '').trim()
    const beforeMp = patchId
      ? (data.mpRecruitmentOrders ?? []).find((o) => o.id === patchId) ?? null
      : null
    const beforeSelected = beforeMp ? selectedApplicantIdSet(beforeMp) : new Set<string>()
    const result = patchMpRecruitmentOrderInSnapshot(data, body)
    if (!result.ok) {
      sendOpsJson(res, result.status, { ok: false, error: result.error })
      return
    }
    await io.save(data)
    if (beforeMp && patchId) {
      const afterMp = (data.mpRecruitmentOrders ?? []).find((o) => o.id === patchId) as
        | RegistryMpRecruitmentOrder
        | undefined
      if (afterMp) {
        const afterSelected = selectedApplicantIdSet(afterMp)
        const newlySelected = [...afterSelected].filter((id) => !beforeSelected.has(id))
        const auditedAt = new Date().toLocaleString('zh-CN', { hour12: false })
        for (const aid of newlySelected) {
          const applicant = (afterMp.applicants ?? []).find((a) => String(a.id) === aid)
          if (!applicant) continue
          void notifyAuditPassSubscribe(data, afterMp, applicant, auditedAt).catch((e) => {
            console.warn('[patch] audit subscribe failed', e instanceof Error ? e.message : e)
          })
        }
      }
    }
    sendOpsJson(res, 200, { ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_mp_recruitment_orders_patch_failed',
      detail: msg.slice(0, 800),
    })
  }
}
