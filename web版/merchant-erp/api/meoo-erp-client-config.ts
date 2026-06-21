/**
 * GET /api/meoo-erp-client-config — 浏览器登录用 Supabase 公网配置（anon key 可公开）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { MEOO_ECS_POSTGREST_PUBLIC_DEFAULT } from '../vite-plugins/merchantSupabaseAdminEnv.js'

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(status).send(JSON.stringify(body))
}

function readPublicSupabaseUrl(): string {
  return (
    process.env.MEOO_SUPABASE_PUBLIC_URL ??
    process.env.VITE_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    MEOO_ECS_POSTGREST_PUBLIC_DEFAULT
  )
    .trim()
    .replace(/\/$/, '')
}

function readPublicAnonKey(): string {
  return (process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '').trim()
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.status(204).end()
    return
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  const supabaseUrl = readPublicSupabaseUrl()
  const supabaseAnonKey = readPublicAnonKey()
  if (!supabaseUrl || !supabaseAnonKey) {
    sendJson(res, 503, {
      ok: false,
      error: 'client_config_not_configured',
      missing: [
        !supabaseUrl ? 'VITE_SUPABASE_URL' : null,
        !supabaseAnonKey ? 'VITE_SUPABASE_ANON_KEY' : null,
      ].filter(Boolean),
      hint:
        '轻量 auth-api 环境需配置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY（与 ~/stack/auth-api.env 一致）。',
    })
    return
  }

  sendJson(res, 200, {
    ok: true,
    supabaseUrl,
    supabaseAnonKey,
  })
}
