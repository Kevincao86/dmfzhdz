/**
 * GET/POST /api/meoo-partner-linke-onboard — 林客客户商家「授权 + 代运营合作」
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { requireMerchantRegistryAuth } from '../src/lib/merchantRegistryAuth.js'
import { fetchPartnerTenantProfile, partnerClientsDataTenantId } from '../src/lib/partnerTenantProfile.js'
import {
  listPartnerLinkeOnboarding,
  retryPartnerLinkeCooperation,
  startPartnerLinkeOnboardInvite,
} from '../src/lib/partnerLinkeOnboardCore.js'
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
  const profile = await fetchPartnerTenantProfile(admin, auth.tenantId)
  if (profile.edition !== 'partner' && profile.edition !== 'partner_agent') {
    sendJson(res, 403, { ok: false, error: 'not_partner', message: '仅服务商版可使用林客客户开通' })
    return
  }

  const dataTenantId = partnerClientsDataTenantId(profile)

  if (req.method === 'GET') {
    const rows = await listPartnerLinkeOnboarding(admin, dataTenantId, {
      ownerAgentTenantId: profile.isAgent ? profile.tenantId : undefined,
    })
    sendJson(res, 200, { ok: true, items: rows })
    return
  }

  if (req.method === 'POST') {
    const body = rawBody(req)
    const action = String(body.action || 'invite').trim()

    if (action === 'invite') {
      const out = await startPartnerLinkeOnboardInvite({
        admin,
        profile,
        clientLabel: typeof body.clientLabel === 'string' ? body.clientLabel : undefined,
        solutionKey: typeof body.solutionKey === 'string' ? body.solutionKey : undefined,
        permissionKeys: Array.isArray(body.permissionKeys)
          ? body.permissionKeys.map((x) => String(x))
          : undefined,
      })
      if (!out.ok) {
        sendJson(res, 400, { ok: false, error: out.error, message: out.message })
        return
      }
      sendJson(res, 200, {
        ok: true,
        item: out.row,
        authUrl: out.authUrl,
        message:
          '已生成林客授权链接。请发送给客户商家在来客完成授权；授权成功后系统将自动发起代运营合作，商家须在来客 App 确认。',
      })
      return
    }

    if (action === 'retry_cooperation') {
      const onboardingId = String(body.onboardingId || '').trim()
      if (!onboardingId) {
        sendJson(res, 400, { ok: false, error: 'missing_id', message: '请提供 onboardingId' })
        return
      }
      const chargeType = body.chargeType === 1 ? 1 : body.chargeType === 2 ? 2 : undefined
      const out = await retryPartnerLinkeCooperation({
        admin,
        dataTenantId,
        onboardingId,
        chargeType,
      })
      if (!out.ok) {
        sendJson(res, 400, { ok: false, message: out.message })
        return
      }
      sendJson(res, 200, {
        ok: true,
        orderId: out.orderId,
        message: '已重新发起代运营合作，请通知商家在来客 App 确认',
      })
      return
    }

    sendJson(res, 400, { ok: false, error: 'unknown_action', message: `未知 action: ${action}` })
    return
  }

  sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
}
