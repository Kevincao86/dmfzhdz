/**
 * POST /api/meoo-mp-recruitment-share-poster-design — 招募单分享海报模版 + AI 底部卖点区
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  rawBody,
  sendMerchantJson,
} from './merchant/merchantGatewayLite.js'

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  try {
    const body = JSON.parse(rawBody(req) || '{}') as {
      order?: Record<string, unknown>
      styleIndex?: number
    }
    const order = body.order && typeof body.order === 'object' ? body.order : null
    if (!order || !String(order.id || '').trim()) {
      sendMerchantJson(res, 400, { ok: false, error: 'missing_order' })
      return
    }
    const { extractPosterFieldsFromOrder, resolvePosterDesign, mergePosterDesign } = await import(
      '../src/lib/recruitmentSharePosterCore.js'
    )
    const { POSTER_TEMPLATES } = await import('../src/lib/recruitmentSharePosterTemplates.js')
    const styleIndex = Number(body.styleIndex)
    const styleIdx = Number.isFinite(styleIndex) ? styleIndex : 0
    const fields = extractPosterFieldsFromOrder(order)
    const fallback = resolvePosterDesign(order, styleIdx)

    let design = fallback
    let source: 'fixed_template' | 'ai_enhanced' = 'fixed_template'
    try {
      const { designRecruitmentSharePosterWithAi } = await import(
        '../src/lib/recruitmentSharePosterDesignAi.js'
      )
      const aiDesign = await designRecruitmentSharePosterWithAi(process.env as Record<string, string>, order)
      design = mergePosterDesign(aiDesign, fallback)
      source = 'ai_enhanced'
    } catch {
      /* 无 AI Key 或调用失败时用本地 footerPanel */
    }

    sendMerchantJson(res, 200, {
      ok: true,
      design,
      fields,
      templates: POSTER_TEMPLATES.map((t) => ({ id: t.id, label: t.label })),
      source,
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
