/**
 * 扁平 GET：与 `/api/ops-sync/registry` 同源，用于规避部分环境下 catch-all `[...slug]` 路由异常。
 * ERP / 运营台拉注册表应优先请求本路径（跨域已设 CORS）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createRegistrySnapshotIoFetch } from './meooRegistrySnapshotIo'
import { sendOpsJson } from './safeOpsJson'
import { dispatchOpsRegistrySupabase } from '../src/ops/opsRegistrySupabaseDispatch'

export const config = { maxDuration: 60 }

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  sendCors(res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  try {
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
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
    const out = await dispatchOpsRegistrySupabase({
      method: 'GET',
      urlPath: '/api/ops-sync/registry',
      bodyRaw: '',
      io,
    })

    const status = typeof out.status === 'number' && Number.isFinite(out.status) ? out.status : 500
    let payload: string
    try {
      payload = typeof out.body === 'string' ? out.body : JSON.stringify(out.body)
    } catch (stringifyErr) {
      const hint = stringifyErr instanceof Error ? stringifyErr.message : String(stringifyErr)
      sendOpsJson(res, 500, {
        ok: false,
        error: 'registry_response_not_serializable',
        detail: hint.slice(0, 400),
      })
      return
    }
    res.status(status).send(payload)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'meoo_ops_sync_registry_failed',
      detail: msg.slice(0, 800),
    })
  }
}
