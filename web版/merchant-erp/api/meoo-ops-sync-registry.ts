/**
 * GET /api/meoo-ops-sync-registry — 与运营台同名路由行为一致（CORS *）。
 * 使 ERP 前端 `OpsRegistryBridge` 在同源即可拉取注册表（含运营台写入的 vendorKeys），无需单独配置 VITE_MERCHANT_ADMIN_ORIGIN。
 *
 * 需在商户 ERP 的 Vercel 环境变量中配置与运营台相同的 Supabase 管理凭据（与 `meoo-ops-sync-registry` 运营台 handler 一致）：
 * VITE_SUPABASE_URL 或 SUPABASE_URL，以及 SUPABASE_SERVICE_ROLE_KEY。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
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

    const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '')
    const serviceRole = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE ??
      ''
    ).trim()

    if (!supabaseUrl || !serviceRole) {
      res.status(503).send(
        JSON.stringify({
          ok: false,
          error: 'supabase_admin_not_configured',
          hint:
            '注册表快照需要 VITE_SUPABASE_URL（或 SUPABASE_URL）与 SUPABASE_SERVICE_ROLE_KEY；与运营台共用同一 Supabase 实例。',
        }),
      )
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await loadRegistrySnapshotForGet(io)

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
      ...(aborted
        ? {
            hint:
              '拉取 Supabase ops_registry_snapshot 超时。请核对 SUPABASE_URL / Service Role；或检查 Vercel Functions 区域与库是否过远。',
          }
        : {}),
    })
  }
}
