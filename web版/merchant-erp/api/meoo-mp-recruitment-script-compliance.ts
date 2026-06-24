/**
 * POST /api/meoo-mp-recruitment-script-compliance — 探店文稿 AI 违规检核
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  rawBody,
  sendMerchantJson,
} from './merchant/merchantGatewayLite.js'

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
    const { runRecruitmentVideoComplianceCheck } = await import(
      '../src/lib/recruitmentVideoComplianceCore.js'
    )
    const extraText = [
      typeof body.scriptText === 'string' ? body.scriptText : '',
      typeof body.scriptLinkUrl === 'string' ? `文档链接：${body.scriptLinkUrl}` : '',
      typeof body.scriptUrl === 'string' ? `文稿文件：${body.scriptUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    const out = await runRecruitmentVideoComplianceCheck(
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
        extraText,
      },
      env,
      typeof body.provider === 'string' ? body.provider : undefined,
    )
    if (!out.ok) {
      sendMerchantJson(res, 422, out)
      return
    }
    sendMerchantJson(res, 200, out)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendMerchantJson(res, 500, { ok: false, message: msg.slice(0, 400) })
  }
}
