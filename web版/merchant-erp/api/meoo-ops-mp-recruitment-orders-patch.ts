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
  patchMpGroupQrViaPg,
  readRegistryPgConnectionString,
} from '../src/lib/registrySnapshotPgAppend.js'

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

    const id = (body.id ?? '').trim()
    const hasGroupQr = body.groupQrImage !== undefined
    const onlyGroupQr =
      hasGroupQr &&
      !body.order &&
      !body.status &&
      !body.applicants &&
      !body.selectedApplicantIds

    if (onlyGroupQr && readRegistryPgConnectionString()) {
      const pgResult = await patchMpGroupQrViaPg(id, String(body.groupQrImage || ''))
      if (pgResult.ok) {
        sendOpsJson(res, 200, { ok: true, via: 'pg' })
        return
      }
      if (pgResult.error === 'not_found') {
        sendOpsJson(res, 404, { ok: false, error: 'not_found' })
        return
      }
      if (pgResult.error === 'group_qr_too_large') {
        sendOpsJson(res, 400, { ok: false, error: 'group_qr_too_large' })
        return
      }
      if (pgResult.error === 'group_qr_empty') {
        sendOpsJson(res, 400, { ok: false, error: 'group_qr_empty' })
        return
      }
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    purgeExpiredGroupQrsInSnapshot(data)
    const result = patchMpRecruitmentOrderInSnapshot(data, body)
    if (!result.ok) {
      sendOpsJson(res, result.status, { ok: false, error: result.error })
      return
    }
    await io.save(data)
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
