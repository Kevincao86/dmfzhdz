/**
 * POST /api/meoo-ops-mp-library-delete — 批量删除达人库 / 拍摄剪辑团队库 / PR 用户库
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import {
  deleteMpLibraryEntriesFromSnapshot,
  type MpLibraryDeleteKind,
} from '../src/lib/mpLibraryRegistryMutations.js'

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

const VALID_KINDS = new Set<MpLibraryDeleteKind>(['talent', 'shoot', 'edit', 'pr'])

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

    const { requireOpsDeleteSmsGate } = await import('./_lib/opsDeleteSmsGate.js')
    const smsGate = await requireOpsDeleteSmsGate(body)
    if (!smsGate.ok) {
      sendOpsJson(res, smsGate.status, { ok: false, error: smsGate.error, message: smsGate.message })
      return
    }

    const kind = String(body.kind || '').trim() as MpLibraryDeleteKind
    if (!VALID_KINDS.has(kind)) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_kind' })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const result = deleteMpLibraryEntriesFromSnapshot(data, kind, Array.isArray(body.ids) ? body.ids : [])
    if (!result.ok) {
      sendOpsJson(res, result.status, { ok: false, error: result.error })
      return
    }
    await io.save(data)
    sendOpsJson(res, 200, { ok: true, deletedCount: result.deletedCount })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_mp_library_delete_failed',
      detail: msg.slice(0, 800),
    })
  }
}
