/**
 * GET/POST /api/meoo-agent-user-state — 智能体习惯与对话线程（Web / 小程序同源）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  rawBody,
  sendMerchantJson,
} from './merchant/merchantGatewayLite.js'
import { verifyBearerJwt } from '../vite-plugins/aiGateway/authSupabase.js'
import { loadTenantAiContextForUser } from '../vite-plugins/tenantMembershipCore.js'
import {
  mergeAgentUserState,
  readAgentUserState,
  type AgentUserHabitsPayload,
} from '../vite-plugins/agentUserStateCore.js'

export const config = { maxDuration: 15 }

function bearerToken(req: VercelRequest): string {
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim()
  return ''
}

async function resolveUserTenant(req: VercelRequest, env: Record<string, string>) {
  const token = bearerToken(req)
  if (!token) return null
  let user: { id: string } | null = null
  try {
    user = await verifyBearerJwt(`Bearer ${token}`, env)
  } catch {
    user = null
  }
  if (!user?.id) return null
  const ctx = await loadTenantAiContextForUser(user.id, env, token)
  if (!ctx?.tenantId) return null
  return { userId: user.id, tenantId: ctx.tenantId }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  const env = process.env as Record<string, string>
  const scope = await resolveUserTenant(req, env)
  if (!scope) {
    sendMerchantJson(res, 401, { ok: false, error: 'unauthorized' })
    return
  }

  if (req.method === 'GET') {
    const state = readAgentUserState(scope.tenantId, scope.userId)
    sendMerchantJson(res, 200, {
      ok: true,
      habits: state?.habits ?? null,
      thread: state?.thread ?? null,
      updatedAt: state?.updatedAt ?? null,
    })
    return
  }

  if (req.method !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  let body: { habits?: AgentUserHabitsPayload; thread?: unknown[] }
  try {
    body = JSON.parse(rawBody(req) || '{}') as { habits?: AgentUserHabitsPayload; thread?: unknown[] }
  } catch {
    sendMerchantJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }

  const patch: { habits?: AgentUserHabitsPayload; thread?: unknown[] } = {}
  if (body.habits && typeof body.habits === 'object') patch.habits = body.habits
  if (Array.isArray(body.thread)) patch.thread = body.thread

  const state = mergeAgentUserState(scope.tenantId, scope.userId, patch)
  sendMerchantJson(res, 200, {
    ok: true,
    habits: state.habits ?? null,
    thread: state.thread ?? null,
    updatedAt: state.updatedAt,
  })
}
