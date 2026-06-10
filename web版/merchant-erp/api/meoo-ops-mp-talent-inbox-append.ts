/**
 * POST /api/meoo-ops-mp-talent-inbox-append — PR 向达人推送站内信（registry）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import {
  appendMpTalentInboxInSnapshot,
  type MpTalentInboxEntryInput,
} from '../src/lib/mpTalentInboxMutations.js'
import { purgeExpiredGroupQrsInSnapshot } from '../src/lib/mpGroupQrCleanup.js'
import { notifyAuditPassForSelectionInboxEntries } from '../src/lib/mpSubscribeMessageSend.js'

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

    let body: { entries?: MpTalentInboxEntryInput[] }
    try {
      body = JSON.parse(rawBody(req) || '{}') as { entries?: MpTalentInboxEntryInput[] }
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    purgeExpiredGroupQrsInSnapshot(data)
    const entries = body.entries ?? []
    const result = appendMpTalentInboxInSnapshot(data, entries)
    if (!result.ok) {
      sendOpsJson(res, result.status, { ok: false, error: result.error })
      return
    }
    await io.save(data)
    const subscribe = await notifyAuditPassForSelectionInboxEntries(data, entries).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[inbox] selection subscribe batch failed', msg)
      return { sent: 0, skipped: entries.length, failed: [msg.slice(0, 120)] }
    })
    sendOpsJson(res, 200, { ok: true, count: result.count, subscribe })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_mp_talent_inbox_append_failed',
      detail: msg.slice(0, 800),
    })
  }
}
