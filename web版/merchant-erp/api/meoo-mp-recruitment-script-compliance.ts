/**
 * POST /api/meoo-mp-recruitment-script-compliance — 探店文稿 AI 违规检核
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  rawBody,
  sendMerchantJson,
} from './merchant/merchantGatewayLite.js'
import {
  chargeMpAiPointsAfterSuccess,
  readMpSessionToken,
  requireMpAiPointsAffordable,
  sendPointsGateError,
} from './_lib/mpCompliancePointsGate.js'
import { mpPointsSpendHttpStatus } from '../src/lib/mpComplianceApiAuth.js'
import { parseMpBillingRole } from '../src/lib/mpBillingRoleHint.js'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, message: 'method_not_allowed' })
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
    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendMerchantJson(res, 400, { ok: false, message: 'invalid_json' })
      return
    }

    const token = readMpSessionToken(req, body)
    if (!token) {
      sendMerchantJson(res, 401, { ok: false, message: '请先登录后再使用 AI 文稿检核', error: 'login_required' })
      return
    }

    const billingRole = parseMpBillingRole(body.billingRole ?? body.libraryRole)
    const gate = await requireMpAiPointsAffordable(token, 'article', { roleHint: billingRole })
    if (!gate.ok) {
      sendPointsGateError(res, sendMerchantJson, gate)
      return
    }

    const { runRecruitmentScriptComplianceCheck } = await import(
      '../src/lib/recruitmentScriptComplianceCore.js'
    )
    const { sessionTokenFromHeaders, resolveMpAccountScopeFromSessionToken } = await import(
      '../vite-plugins/aiTokenUsageCore.js'
    )
    const headerToken = sessionTokenFromHeaders(req.headers as Record<string, string | string[] | undefined>)
    const callerScope = headerToken ? await resolveMpAccountScopeFromSessionToken(headerToken) : null
    const extraText = [
      typeof body.scriptText === 'string' ? body.scriptText : '',
      typeof body.scriptLinkUrl === 'string' ? `文档链接：${body.scriptLinkUrl}` : '',
      typeof body.scriptUrl === 'string' ? `文稿文件：${body.scriptUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    const out = await runRecruitmentScriptComplianceCheck(
      {
        mpOrderId: typeof body.mpOrderId === 'string' ? body.mpOrderId : undefined,
        applicantId: typeof body.applicantId === 'string' ? body.applicantId : undefined,
        platform: typeof body.platform === 'string' ? body.platform : '小红书',
        orderTitle: typeof body.orderTitle === 'string' ? body.orderTitle : undefined,
        recruitmentInfo: typeof body.recruitmentInfo === 'string' ? body.recruitmentInfo : undefined,
        merchantRequirements:
          typeof body.merchantRequirements === 'string' ? body.merchantRequirements : undefined,
        taskDetail: typeof body.taskDetail === 'string' ? body.taskDetail : undefined,
        category: typeof body.category === 'string' ? body.category : undefined,
        region: typeof body.region === 'string' ? body.region : undefined,
        applicantName: typeof body.applicantName === 'string' ? body.applicantName : undefined,
        scriptText: typeof body.scriptText === 'string' ? body.scriptText : undefined,
        scriptLinkUrl: typeof body.scriptLinkUrl === 'string' ? body.scriptLinkUrl : undefined,
        scriptUrl: typeof body.scriptUrl === 'string' ? body.scriptUrl : undefined,
        extraText,
      },
      env,
      typeof body.provider === 'string' ? body.provider : undefined,
      { env, token: headerToken || token, scope: callerScope, mpOrderId: typeof body.mpOrderId === 'string' ? body.mpOrderId : undefined },
    )
    if (!out.ok) {
      sendMerchantJson(res, 422, out)
      return
    }

    const spend = await chargeMpAiPointsAfterSuccess(token, 'article', {
      note: typeof body.mpOrderId === 'string' ? `article:${body.mpOrderId}` : 'script_compliance',
      roleHint: billingRole,
    })
    if (!spend.ok) {
      sendMerchantJson(res, mpPointsSpendHttpStatus(spend.error), {
        ok: false,
        message: spend.message,
        error: spend.error,
        required: spend.required,
        balance: spend.balance,
      })
      return
    }

    sendMerchantJson(res, 200, {
      ...out,
      pointsCharged: spend.pointsCharged,
      mpAiPointsBalance: spend.newBalance,
      billingKind: 'article' as const,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendMerchantJson(res, 500, { ok: false, message: msg.slice(0, 400) })
  }
}
