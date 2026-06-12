/**
 * POST /api/meoo-mp-recruitment-share-poster-design — 招募单分享海报固定模版（不再逐张调 AI）
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
    const { extractPosterFieldsFromOrder, resolvePosterDesign } = await import(
      '../src/lib/recruitmentSharePosterCore.js'
    )
    const { POSTER_TEMPLATES } = await import('../src/lib/recruitmentSharePosterTemplates.js')
    const styleIndex = Number(body.styleIndex)
    const fields = extractPosterFieldsFromOrder(order)
    const design = resolvePosterDesign(order, Number.isFinite(styleIndex) ? styleIndex : 0)
    sendMerchantJson(res, 200, {
      ok: true,
      design,
      fields,
      templates: POSTER_TEMPLATES.map((t) => ({ id: t.id, label: t.label })),
      source: 'fixed_template',
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
