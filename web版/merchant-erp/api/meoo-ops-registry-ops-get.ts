/**
 * GET /api/meoo-ops-sync-registry — 运营台经 erp-api 拉全量注册表（不做商户租户裁剪）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch, loadRegistrySnapshotForGet } from '../src/lib/registrySnapshotIoFetch.js'

export const config = { maxDuration: 60 }

function sendOpsJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  try {
    if (res.writableEnded || res.headersSent) return
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(status).send(JSON.stringify(body))
  } catch {
    try {
      if (!res.writableEnded && !res.headersSent) res.end()
    } catch {
      /* noop */
    }
  }
}

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    sendCors(res)
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    if (req.method !== 'GET') {
      res.status(405).send(JSON.stringify({ ok: false, error: 'method_not_allowed' }))
      return
    }

    const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
    if (missingParts.length > 0) {
      res.status(503).send(
        JSON.stringify({
          ok: false,
          error: 'supabase_admin_not_configured',
          missing: missingParts,
          hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
        }),
      )
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    let data
    try {
      data = await loadRegistrySnapshotForGet(io)
    } catch (loadErr) {
      const hint = loadErr instanceof Error ? loadErr.message : String(loadErr)
      console.error('[meoo-ops-registry-ops-get] loadRegistrySnapshotForGet failed, fallback io.load:', hint.slice(0, 400))
      data = await io.load()
    }

    let payload: string
    try {
      payload = JSON.stringify(data)
    } catch (stringifyErr) {
      const hint = stringifyErr instanceof Error ? stringifyErr.message : String(stringifyErr)
      sendOpsJson(res, 500, {
        ok: false,
        error: 'registry_response_not_serializable',
        detail: hint.slice(0, 400),
      })
      return
    }
    res.status(200).send(payload)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const aborted = e instanceof Error && (e.name === 'AbortError' || /aborted|timeout/i.test(msg))
    sendOpsJson(res, 500, {
      ok: false,
      error: aborted ? 'registry_snapshot_fetch_timeout' : 'meoo_ops_sync_registry_failed',
      detail: msg.slice(0, 800),
    })
  }
}
