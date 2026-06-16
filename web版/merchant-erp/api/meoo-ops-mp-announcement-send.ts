/**
 * POST /api/meoo-ops-mp-announcement-send — 运营台向达人小程序批量推送公告（registry mpTalentInbox）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import {
  sendMpOpsAnnouncementInSnapshot,
  type MpOpsAnnouncementTargetFilter,
} from '../src/lib/mpOpsAnnouncementCore.js'
import { purgeExpiredGroupQrsInSnapshot } from '../src/lib/mpGroupQrCleanup.js'

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
      title?: string
      body?: string
      showHomePopup?: boolean
      targetFilter?: MpOpsAnnouncementTargetFilter
      createdBy?: string | null
    }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    purgeExpiredGroupQrsInSnapshot(data)
    const result = sendMpOpsAnnouncementInSnapshot(data, {
      title: String(body.title || ''),
      body: String(body.body || ''),
      showHomePopup: body.showHomePopup !== false,
      targetFilter: body.targetFilter || {},
      createdBy: body.createdBy ?? null,
    })
    if (!result.ok) {
      sendOpsJson(res, result.status, { ok: false, error: result.error })
      return
    }
    await io.save(data)
    sendOpsJson(res, 200, {
      ok: true,
      announcementId: result.announcementId,
      recipientCount: result.recipientCount,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_mp_announcement_send_failed',
      detail: msg.slice(0, 800),
    })
  }
}
