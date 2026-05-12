/**
 * 运营台注册表「轻量 POST」共用：AI Key / 模型 / 短视频网关等独立路由，避免走 catch-all 时加载整份 dispatch。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createRegistrySnapshotIoFetch } from './meooRegistrySnapshotIo.js'
import { sendOpsJson } from './safeOpsJson.js'
import type { RegistrySnapshotIo } from '../src/ops/registrySnapshotIo'

export const opsRegistrySyncLiteFnConfig = { maxDuration: 60 }

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

export function registrySyncLiteReadSupabase():
  | { ok: true; supabaseUrl: string; serviceRole: string }
  | { ok: false } {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  const serviceRole = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    ''
  ).trim()
  if (!supabaseUrl || !serviceRole) return { ok: false }
  return { ok: true, supabaseUrl, serviceRole }
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
    const env = registrySyncLiteReadSupabase()
    if (!env.ok) {
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
    const io = createRegistrySnapshotIoFetch(env.supabaseUrl, env.serviceRole)
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
      hint: '请查看 Vercel Function Logs；多为注册表快照读写异常。',
    })
  }
}
