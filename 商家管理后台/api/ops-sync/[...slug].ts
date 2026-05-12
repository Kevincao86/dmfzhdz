/**
 * Vercel：/api/ops-sync/* 注册表（Supabase ops_registry_snapshot），与 ERP 拉取同源。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createRegistrySnapshotIoFetch, loadRegistrySnapshotForGet } from '../meooRegistrySnapshotIo'
import { sendOpsJson } from '../safeOpsJson'
import { dispatchOpsRegistrySupabase } from '../../src/ops/opsRegistrySupabaseDispatch'

export const config = { maxDuration: 60 }

const OPS_SYNC_PREFIX = '/api/ops-sync/'

/** Vercel 部分环境下 catch-all 的 req.query.slug 为空，需从 URL 解析，否则 urlPath 变成 /api/ops-sync/ 导致注册表 404 */
function slugSegmentsFromRequest(req: VercelRequest): string[] {
  const slug = req.query.slug
  if (Array.isArray(slug)) return slug.map(String).filter(Boolean)
  if (typeof slug === 'string' && slug.trim()) {
    return slug.includes('/') ? slug.split('/').filter(Boolean) : [slug.trim()]
  }
  const url = typeof req.url === 'string' ? req.url : ''
  const pathOnly = url.split('?')[0]?.trim() ?? ''
  if (pathOnly.startsWith(OPS_SYNC_PREFIX)) {
    const rest = pathOnly.slice(OPS_SYNC_PREFIX.length)
    return rest ? rest.split('/').filter(Boolean) : []
  }
  return []
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

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
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

    const parts = slugSegmentsFromRequest(req)
    const urlPath = OPS_SYNC_PREFIX + parts.join('/')

    const method = req.method ?? 'GET'
    const bodyRaw =
      method === 'POST' || method === 'PUT' || method === 'PATCH' ? rawBody(req) : ''

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

    if (method === 'GET' && urlPath === '/api/ops-sync/registry') {
      const data = await loadRegistrySnapshotForGet(io)
      let payload: string
      try {
        payload = JSON.stringify(data)
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
      res.status(200).send(payload)
      return
    }

    const out = await dispatchOpsRegistrySupabase({
      method,
      urlPath,
      bodyRaw,
      io,
    })

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
      error: 'ops_sync_handler_failed',
      detail: msg.slice(0, 800),
      hint: '请查看 Vercel Function Logs；常见原因：未执行迁移 ops_registry_snapshot、缺少 SUPABASE_SERVICE_ROLE_KEY。',
    })
  }
}
