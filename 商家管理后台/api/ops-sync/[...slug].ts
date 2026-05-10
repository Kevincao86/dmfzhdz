/**
 * Vercel：/api/ops-sync/* 注册表（Supabase ops_registry_snapshot），与 ERP 拉取同源。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from '../lib/createOpsServiceRoleClient'
import { sendOpsJson } from '../lib/safeVercelJson'
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
  sendCors(res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  try {
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    const parts = slugSegmentsFromRequest(req)
    const urlPath = OPS_SYNC_PREFIX + parts.join('/')

    const method = req.method ?? 'GET'
    const bodyRaw =
      method === 'POST' || method === 'PUT' || method === 'PATCH' ? rawBody(req) : ''

    const client = createOpsServiceRoleClient()
    if (!client.ok) {
      res.status(client.status).send(JSON.stringify(client.body))
      return
    }

    const out = await dispatchOpsRegistrySupabase({
      method,
      urlPath,
      bodyRaw,
      admin: client.admin,
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
