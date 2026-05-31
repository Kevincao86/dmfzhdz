/**
 * 注册表轻量 POST（vendor-keys / video-ai 等），供 ECS erp-api 与 Vercel 扁平路由共用。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'
import {
  createRegistrySnapshotIoFetch,
  type RegistrySnapshotIo,
} from '../src/lib/registrySnapshotIoFetch.js'

export const opsRegistrySyncLiteFnConfig = { maxDuration: 60 }

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

export function registrySyncLiteSendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export function registrySyncLiteRawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return ''
  } catch {
    return ''
  }
}

export async function handleRegistrySyncLitePost(
  req: VercelRequest,
  res: VercelResponse,
  run: (io: RegistrySnapshotIo, bodyRaw: string) => Promise<{ status: number; body: unknown }>,
): Promise<void> {
  try {
    registrySyncLiteSendCors(res)
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    if (req.method !== 'POST') {
      res.status(405).send(JSON.stringify({ ok: false, error: 'method_not_allowed' }))
      return
    }
    const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
    if (missingParts.length > 0 || !supabaseUrl || !serviceRole) {
      res.status(503).send(
        JSON.stringify({
          ok: false,
          error: 'supabase_admin_not_configured',
          missing: missingParts,
          hint: '注册表需要 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY（ECS auth-api.env）',
        }),
      )
      return
    }
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const bodyRaw = registrySyncLiteRawBody(req)
    const out = await run(io, bodyRaw)
    let payload: string
    try {
      payload = typeof out.body === 'string' ? out.body : JSON.stringify(out.body)
    } catch (stringifyErr) {
      const hint = stringifyErr instanceof Error ? stringifyErr.message : String(stringifyErr)
      payload = JSON.stringify({
        ok: false,
        error: 'registry_response_not_serializable',
        detail: hint.slice(0, 400),
      })
      res.status(500).send(payload)
      return
    }
    res.status(out.status).send(payload)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'ops_sync_lite_post_failed',
      detail: msg.slice(0, 800),
    })
  }
}
