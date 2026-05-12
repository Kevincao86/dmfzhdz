/**
 * 扁平 GET：与 `/api/ops-sync/registry` 同源，用于规避部分环境下 catch-all `[...slug]` 路由异常。
 * ERP / 运营台拉注册表应优先请求本路径（跨域已设 CORS）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createRegistrySnapshotIoFetch, loadRegistrySnapshotForGet } from './meooRegistrySnapshotIo'
import { sendOpsJson } from './safeOpsJson'

export const config = { maxDuration: 60 }

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
            '注册表快照需要 VITE_SUPABASE_URL（或 SUPABASE_URL）与 SUPABASE_SERVICE_ROLE_KEY；并在 Supabase 执行迁移 ops_registry_snapshot。',
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
              '拉取 Supabase ops_registry_snapshot 超时（约 22s）。请核对 SUPABASE_URL / Service Role、表是否存在；若 Vercel 在东京(hnd1)而库在境外，可在 Project → Functions 调整区域或换更近的 Supabase 区域。',
          }
        : {}),
    })
  }
}
