/**
 * POST /api/meoo-ai-ops-plan — 多平台 AI 运营方案（六块结构化产出）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  rawBody,
  sendMerchantJson,
} from './merchant/merchantGatewayShared.js'
import { runAiOpsPlanCore } from '../vite-plugins/merchantAiOpsPlanCore.js'
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
    const gate = await requireErpAiPointsAffordable(auth, 'ops_plan', env)
    if (!gate.ok) {
      sendErpAiPointsGateError(res, sendMerchantJson, gate)
      return
    }
    const out = await runAiOpsPlanCore(rawBody(req), auth, env)
    if (out.status >= 200 && out.status < 300 && out.body?.ok !== false) {
      const charge = await chargeErpAiPointsAfterSuccess(auth, 'ops_plan', env, {
        tenantId: gate.tenantId,
        idempotencyKey: `ops_plan:${gate.userId}:${Date.now().toString(36)}`,
        note: 'AI 运营方案',
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
