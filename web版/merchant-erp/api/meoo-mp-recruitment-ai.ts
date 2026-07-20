/**
 * POST /api/meoo-mp-recruitment-ai — 达人招募小程序：商单 AI 标签 / 达人匹配 / 探店排期（豆包·通义千问）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  rawBody,
  sendMerchantJson,
} from './merchant/merchantGatewayLite.js'
import { sessionTokenFromHeaders, resolveMpAccountScopeFromSessionToken } from '../vite-plugins/aiTokenUsageCore.js'
import {
  chargeMpAiPointsAfterSuccess,
  requireMpAiPointsAffordable,
  sendPointsGateError,
} from './_lib/mpCompliancePointsGate.js'

export const config = { maxDuration: 90 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  try {
    const { mergeMerchantAiEnvWithRegistrySnapshot } = await import(
      '../vite-plugins/merchantRegistryVendorEnv.js'
    )
    const env = await mergeMerchantAiEnvWithRegistrySnapshot(
      process.cwd(),
      process.env as Record<string, string>,
    )
    const token = sessionTokenFromHeaders(req.headers as Record<string, string | string[] | undefined>)
    const bodyRaw = rawBody(req)
    const bodyPeek = JSON.parse(bodyRaw || '{}') as { mode?: string; billingRole?: string }
    const mode = String(bodyPeek.mode || 'tag').trim()
    const roleHintRaw = String(bodyPeek.billingRole || '').trim()
    const roleHint =
      roleHintRaw === 'pr' ||
      roleHintRaw === 'talent' ||
      roleHintRaw === 'shoot' ||
      roleHintRaw === 'edit'
        ? roleHintRaw
        : null

    if (token) {
      const gate = await requireMpAiPointsAffordable(token, 'recruitment_ai', { roleHint })
      if (!gate.ok) {
        sendPointsGateError(res, sendMerchantJson, gate)
        return
      }
    }

    const callerScope = token ? await resolveMpAccountScopeFromSessionToken(token) : null
    const usageRecord = { env, token, scope: callerScope, skipBilling: false }
    const out =
      mode === 'tag'
        ? await (
            await import('../vite-plugins/mpRecruitmentHallAiTagPersist.js')
          ).runTagModeWithPersist(bodyRaw, env, usageRecord)
        : await (await import('../vite-plugins/mpRecruitmentAiCore.js')).runMpRecruitmentAiCore(
            bodyRaw,
            env,
            usageRecord,
          )

    if (token && out.status >= 200 && out.status < 300 && out.body?.ok !== false) {
      const charge = await chargeMpAiPointsAfterSuccess(token, 'recruitment_ai', {
        note: `recruitment_ai:${mode}`,
        roleHint,
      })
      if (charge.ok) {
        out.body = {
          ...out.body,
          pointsCharged: charge.pointsCharged,
          pointsBalance: charge.newBalance,
        }
      }
    }

    sendMerchantJson(res, out.status, out.body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendMerchantJson(res, 500, {
      ok: false,
      error: 'meoo_mp_recruitment_ai_failed',
      detail: msg.slice(0, 600),
    })
  }
}
