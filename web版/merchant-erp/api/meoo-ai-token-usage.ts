/**
 * GET /api/meoo-ai-token-usage?range=day|week|month|custom&from=&to=
 * 商家 ERP：Bearer Supabase JWT；星选：X-Mp-Session 或 Bearer mp 会话
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyBearerJwt } from '../vite-plugins/aiGateway/authSupabase.js'
import { verifyMpSessionToken } from '../vite-plugins/aiGateway/authMpSession.js'
import { loadTenantAiContextForUser } from '../vite-plugins/tenantMembershipCore.js'
import {
  queryAiTokenUsage,
  resolveAiUsageScope,
  resolveTenantScopeForUsage,
  type AiTokenUsageQuery,
} from '../vite-plugins/aiTokenUsageCore.js'
import { createMpAuthRest, resolveSession } from '../src/lib/mpAccountAuth.js'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'

export const config = { maxDuration: 30 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function bearerToken(req: VercelRequest): string {
  const mpHdr = req.headers['x-mp-session']
  if (typeof mpHdr === 'string' && mpHdr.trim()) return mpHdr.trim()
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim()
  return ''
}

function parseQuery(req: VercelRequest): AiTokenUsageQuery {
  const q = req.query ?? {}
  const rawRange = typeof q.range === 'string' ? q.range : 'week'
  const range =
    rawRange === 'day' || rawRange === 'week' || rawRange === 'month' || rawRange === 'custom'
      ? rawRange
      : 'week'
  return {
    range,
    from: typeof q.from === 'string' ? q.from : undefined,
    to: typeof q.to === 'string' ? q.to : undefined,
  }
}

async function resolveScopeFromRequest(
  req: VercelRequest,
  env: Record<string, string>,
): Promise<{ scopeType: 'tenant' | 'mp_account'; scopeId: string } | null> {
  const token = bearerToken(req)
  if (!token) return null

  const mpHdr = req.headers['x-mp-session']
  const preferMp = typeof mpHdr === 'string' && mpHdr.trim().length > 0

  if (preferMp) {
    const admin = readMerchantSupabaseAdminEnv()
    if (admin.supabaseUrl && admin.serviceRole) {
      const rest = createMpAuthRest(admin.supabaseUrl, admin.serviceRole)
      const sess = await resolveSession(rest, token)
      if (sess?.account?.id) {
        return { scopeType: 'mp_account', scopeId: sess.account.id }
      }
    }
    const mpUser = await verifyMpSessionToken(token, env)
    if (mpUser?.id.startsWith('mp:')) {
      const id = mpUser.id.slice(3).trim()
      if (id) return { scopeType: 'mp_account', scopeId: id }
    }
    return null
  }

  let user: { id: string; email?: string } | null = null
  try {
    user = await verifyBearerJwt(`Bearer ${token}`, env)
  } catch {
    user = null
  }
  if (!user) {
    const mpUser = await verifyMpSessionToken(token, env)
    if (mpUser?.id.startsWith('mp:')) {
      const id = mpUser.id.slice(3).trim()
      if (id) return { scopeType: 'mp_account', scopeId: id }
    }
    return null
  }

  if (user.id.startsWith('mp:')) {
    return resolveAiUsageScope(user.id, null)
  }

  const ctx = await loadTenantAiContextForUser(user.id, env, token)
  return resolveTenantScopeForUsage(user.id, env, undefined, ctx)
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mp-Session')
    res.status(204).end()
    return
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  const env = process.env as Record<string, string>
  const scope = await resolveScopeFromRequest(req, env)
  if (!scope) {
    sendJson(res, 401, { ok: false, error: 'unauthorized' })
    return
  }

  const query = parseQuery(req)
  const data = await queryAiTokenUsage(scope, query, env)
  sendJson(res, 200, data as unknown as Record<string, unknown>)
}
