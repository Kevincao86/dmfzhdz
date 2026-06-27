/**
 * Vercel：/api/ops-sync/* — 注册表 GET/写 Key 等已改 307 至 erp-api；其余仍走 dispatch。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redirectRegistryToErpApi, sendErpApiRedirectCors } from '../_lib/opsErpApiRedirect.js'
import { sendOpsJson } from '../_lib/safeOpsJson.js'

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

    if (method === 'GET' && urlPath === '/api/ops-sync/registry') {
      redirectRegistryToErpApi(res, '/api/meoo-ops-sync-registry')
      return
    }

    if (method === 'POST' && urlPath === '/api/ops-sync/vendor-keys') {
      redirectRegistryToErpApi(res, '/api/ops-sync/vendor-keys')
      return
    }
    if (method === 'POST' && urlPath === '/api/ops-sync/ai') {
      redirectRegistryToErpApi(res, '/api/ops-sync/ai')
      return
    }
    if (method === 'POST' && urlPath === '/api/ops-sync/video-ai') {
      redirectRegistryToErpApi(res, '/api/ops-sync/video-ai')
      return
    }
    if (method === 'POST' && urlPath === '/api/ops-sync/tenants/delete') {
      redirectRegistryToErpApi(res, '/api/meoo-ops-registry-tenant-delete')
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

    const { createRegistrySnapshotIoFetch } = await import('../meooRegistrySnapshotIo.js')
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)

    /** 动态加载：避免 GET /registry 冷启动拖入整份 dispatch（含 node:crypto 等）→ FUNCTION_INVOCATION_FAILED / OOM */
    const { dispatchOpsRegistrySupabase } = await import('../../src/ops/opsRegistrySupabaseDispatch.js')
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
    sendErpApiRedirectCors(res)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'ops_sync_handler_failed',
      detail: msg.slice(0, 800),
      hint:
        '注册表读写请经 https://mofangdianai.com/erp-api ；请 Redeploy 运营台并确认 ECS auth-api 已运行（git pull + ecs-run-auth-api.sh）。',
    })
  }
}
