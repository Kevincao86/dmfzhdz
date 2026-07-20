/**
 * POST /api/meoo-ai-product-plan — 结合菜单/毛利/竞品生成团购上架方案
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  rawBody,
  sendMerchantJson,
} from './merchant/merchantGatewayShared.js'
import { runAiProductPlanCore } from '../vite-plugins/merchantStoreIntelCore.js'
import {
  authHeaderFromRequest,
  chargeErpAiPointsAfterSuccess,
  requireErpAiPointsAffordable,
  sendErpAiPointsGateError,
} from './_lib/erpAiApiPointsGate.js'

export const config = { maxDuration: 120 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  try {
    const auth = authHeaderFromRequest(req)
    const env = process.env as Record<string, string>
    const gate = await requireErpAiPointsAffordable(auth, 'product_plan', env)
    if (!gate.ok) {
      sendErpAiPointsGateError(res, sendMerchantJson, gate)
      return
    }
    const out = await runAiProductPlanCore(rawBody(req), auth, env)
    if (out.status >= 200 && out.status < 300 && out.body?.ok !== false) {
      const charge = await chargeErpAiPointsAfterSuccess(auth, 'product_plan', env, {
        tenantId: gate.tenantId,
        idempotencyKey: `product_plan:${gate.userId}:${Date.now().toString(36)}`,
        note: 'AI 商品上架方案',
      })
      if (charge) {
        out.body = {
          ...out.body,
          pointsCharged: charge.pointsCharged,
          pointsBalance: charge.balance,
        }
      }
    }
    sendMerchantJson(res, out.status, out.body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendMerchantJson(res, 500, { ok: false, error: 'internal_error', detail: msg.slice(0, 600) })
  }
}
