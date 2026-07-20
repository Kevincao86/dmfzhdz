/**
 * POST /api/meoo-mp-recruitment-video-compliance — 探店成片抖音生活服务违规 AI 检核
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

export const config = { maxDuration: 120 }

function readClientDurationSec(body: Record<string, unknown>): number | null {
  const raw = body.durationSec ?? body.videoDurationSec ?? body.duration
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.max(1, Math.ceil(n))
}

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
      sendMerchantJson(res, 401, { ok: false, message: '请先登录后再使用 AI 视频检核', error: 'login_required' })
      return
    }

    const billingRole = parseMpBillingRole(body.billingRole ?? body.libraryRole)
    const clientDurationSec = readClientDurationSec(body)

    // 客户端时长已知时先拦余额，避免余额不足仍走重 ASR/抽帧
    if (clientDurationSec != null) {
      const earlyGate = await requireMpAiPointsAffordable(token, 'video', {
        durationSec: clientDurationSec,
        roleHint: billingRole,
      })
      if (!earlyGate.ok) {
        sendPointsGateError(res, sendMerchantJson, earlyGate)
        return
      }
    }

    const { runRecruitmentVideoComplianceCheck, preloadVideoComplianceMedia } = await import(
      '../src/lib/recruitmentVideoComplianceCore.js'
    )
    const { sessionTokenFromHeaders, resolveMpAccountScopeFromSessionToken } = await import(
      '../vite-plugins/aiTokenUsageCore.js'
    )
    const headerToken = sessionTokenFromHeaders(req.headers as Record<string, string | string[] | undefined>)
    const callerScope = headerToken ? await resolveMpAccountScopeFromSessionToken(headerToken) : null
    const usageCtx = {
      env,
      token: headerToken || token,
      scope: callerScope,
      mpOrderId: typeof body.mpOrderId === 'string' ? body.mpOrderId : undefined,
    }
    const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl : undefined
    const preloadedMediaExtract = videoUrl
      ? await preloadVideoComplianceMedia({ videoUrl, mpOrderId: usageCtx.mpOrderId }, env, usageCtx)
      : null
    const billingSec =
      preloadedMediaExtract?.durationSec != null && Number(preloadedMediaExtract.durationSec) > 0
        ? Math.max(1, Math.ceil(Number(preloadedMediaExtract.durationSec)))
        : clientDurationSec != null
          ? clientDurationSec
          : 1

    // 以实测时长再校验一次（套餐桶+充值桶合计）；不足则不得进入 LLM 检核
    const preciseGate = await requireMpAiPointsAffordable(token, 'video', {
      durationSec: billingSec,
      roleHint: billingRole,
    })
    if (!preciseGate.ok) {
      sendPointsGateError(res, sendMerchantJson, preciseGate)
      return
    }

    const out = await runRecruitmentVideoComplianceCheck(
      {
        mpOrderId: typeof body.mpOrderId === 'string' ? body.mpOrderId : undefined,
        applicantId: typeof body.applicantId === 'string' ? body.applicantId : undefined,
        platform: typeof body.platform === 'string' ? body.platform : undefined,
        orderTitle: typeof body.orderTitle === 'string' ? body.orderTitle : undefined,
        recruitmentInfo: typeof body.recruitmentInfo === 'string' ? body.recruitmentInfo : undefined,
        merchantRequirements:
          typeof body.merchantRequirements === 'string' ? body.merchantRequirements : undefined,
        taskDetail: typeof body.taskDetail === 'string' ? body.taskDetail : undefined,
        category: typeof body.category === 'string' ? body.category : undefined,
        region: typeof body.region === 'string' ? body.region : undefined,
        applicantName: typeof body.applicantName === 'string' ? body.applicantName : undefined,
        videoUrl,
        douyinPublishUrl:
          typeof body.douyinPublishUrl === 'string' ? body.douyinPublishUrl : undefined,
        extraText: typeof body.extraText === 'string' ? body.extraText : undefined,
        preloadedMediaExtract,
      },
      env,
      typeof body.provider === 'string' ? body.provider : undefined,
      usageCtx,
    )
    if (!out.ok) {
      sendMerchantJson(res, 422, out)
      return
    }

    const durationSec = Math.max(
      1,
      Math.ceil(Number(out.durationSec) || billingSec || clientDurationSec || 1),
    )
    if (durationSec > billingSec) {
      const finalGate = await requireMpAiPointsAffordable(token, 'video', {
        durationSec,
        roleHint: billingRole,
      })
      if (!finalGate.ok) {
        sendPointsGateError(res, sendMerchantJson, finalGate)
        return
      }
    }

    const spend = await chargeMpAiPointsAfterSuccess(token, 'video', {
      durationSec,
      note: typeof body.mpOrderId === 'string' ? `video:${body.mpOrderId}` : 'video_compliance',
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

    // 消耗积分仅以真实扣减为准，禁止回传估算值误导前端
    sendMerchantJson(res, 200, {
      ...out,
      pointsCharged: spend.pointsCharged,
      mpAiPointsBalance: spend.newBalance,
      billingKind: 'video' as const,
      durationSec,
      videoMinutesBilled: Math.max(1, Math.ceil(durationSec / 60)),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendMerchantJson(res, 500, { ok: false, message: msg.slice(0, 400) })
  }
}
