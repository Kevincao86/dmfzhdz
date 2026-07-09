/**
 * GET/POST /api/meoo-partner-agents — 总代管理子代理
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { requireMerchantRegistryAuth } from '../src/lib/merchantRegistryAuth.js'
import {
  assertParentPartnerTenant,
  listPartnerAgents,
  provisionPartnerAgentTenant,
} from '../src/lib/partnerAgentCore.js'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { nodeSupabaseClientOptions } from '../src/lib/nodeSupabaseClientOptions.js'

export const config = { maxDuration: 60 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body))
}

function rawBody(req: VercelRequest): Record<string, unknown> {
  try {
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}') as Record<string, unknown>
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}') as Record<string, unknown>
    if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>
  } catch {
    /* ignore */
  }
  return {}
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  const auth = await requireMerchantRegistryAuth(req)
  if (!auth.ok) {
    sendJson(res, auth.status, { ok: false, error: auth.error, message: auth.message })
    return
  }

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length) {
    sendJson(res, 503, { ok: false, error: 'supabase_not_configured', missing: missingParts })
    return
  }

  const admin = createClient(supabaseUrl, serviceRole, nodeSupabaseClientOptions())
  const parentCheck = await assertParentPartnerTenant(admin, auth.tenantId)
  if (!parentCheck.ok) {
    sendJson(res, 403, { ok: false, error: parentCheck.error, message: parentCheck.message })
    return
  }

  if (req.method === 'GET') {
    const agents = await listPartnerAgents(admin, auth.tenantId)
    sendJson(res, 200, { ok: true, agents })
    return
  }

  if (req.method === 'POST') {
    const body = rawBody(req)
    const out = await provisionPartnerAgentTenant({
      supabaseUrl,
      serviceRole,
      parentTenantId: auth.tenantId,
      companyName: String(body.companyName || ''),
      contactPhone: String(body.contactPhone || ''),
      password: typeof body.password === 'string' ? body.password : undefined,
    })
    if (!out.ok) {
      const status = out.error === 'phone_exists' ? 409 : 400
      sendJson(res, status, { ok: false, error: out.error, message: out.message, detail: out.detail })
      return
    }
    sendJson(res, 200, {
      ok: true,
      tenantId: out.tenantId,
      loginName: out.loginName,
      email: out.email,
      tempPassword: out.tempPassword,
      message: '子代理已创建，请将登录名与初始密码发送给负责人',
    })
    return
  }

  sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
}
