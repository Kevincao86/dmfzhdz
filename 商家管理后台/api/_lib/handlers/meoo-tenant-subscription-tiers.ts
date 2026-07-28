/**
 * GET/POST /api/meoo-tenant-subscription-tiers
 * 商家 ERP 租户：解析当前归属城市的有效订阅档位（含区域加价）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { requireMerchantRegistryAuth } from '../../../../web版/merchant-erp/src/lib/merchantRegistryAuth.js'
import { readMerchantSupabaseAdminEnv } from '../../../../web版/merchant-erp/vite-plugins/merchantSupabaseAdminEnv.js'
import { nodeSupabaseClientOptions } from '../../../../web版/merchant-erp/src/lib/nodeSupabaseClientOptions.js'
import { resolveSubscriptionTiersForTenant } from '../regionalPartnerPricing.js'

export const config = { maxDuration: 30 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
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
  const resolved = await resolveSubscriptionTiersForTenant(admin, auth.tenantId)
  sendJson(res, 200, {
    ok: true,
    tiers: resolved.tiers,
    source: resolved.source,
    pricingCity: resolved.pricingCity,
    partnerId: resolved.partnerId,
  })
}
