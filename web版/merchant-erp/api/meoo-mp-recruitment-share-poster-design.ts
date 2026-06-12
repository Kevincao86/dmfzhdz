/**
 * POST /api/meoo-mp-recruitment-share-poster-design — 招募单分享海报 AI 模版设计
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
    sendMerchantJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  try {
    const body = JSON.parse(rawBody(req) || '{}') as { order?: Record<string, unknown> }
    const order = body.order && typeof body.order === 'object' ? body.order : null
    if (!order || !String(order.id || '').trim()) {
      sendMerchantJson(res, 400, { ok: false, error: 'missing_order' })
      return
    }
    const { mergeMerchantAiEnvWithRegistrySnapshot } = await import(
      '../vite-plugins/merchantRegistryVendorEnv.js'
    )
    const env = await mergeMerchantAiEnvWithRegistrySnapshot(
      process.cwd(),
      process.env as Record<string, string>,
    )
    const { designRecruitmentSharePosterWithAi } = await import(
      '../src/lib/recruitmentSharePosterDesignAi.js'
    )
    const { extractPosterFieldsFromOrder, defaultPosterDesign } = await import(
      '../src/lib/recruitmentSharePosterCore.js'
    )
    const design = await designRecruitmentSharePosterWithAi(env, order)
    const fields = extractPosterFieldsFromOrder(order)
    sendMerchantJson(res, 200, {
      ok: true,
      design,
      fields,
      fallback: defaultPosterDesign(order, fields),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendMerchantJson(res, 500, {
      ok: false,
      error: 'poster_design_failed',
      detail: msg.slice(0, 600),
    })
  }
}
