/**
 * POST /api/meoo-ai-agent-image — 智能体文生图 / 图生图。
 * - builtin：万相 / 豆包 / MiniMax（MERCHANT_AI_*）。
 * - tokenmix：TokenMix OpenAI 兼容 images/generations（须 TOKENMIX_API_KEY）；有参考图时走内置图生图。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  rawBody,
  sendMerchantJson,
} from './merchant/merchantGatewayShared.js'
import { verifyBearerJwt } from '../vite-plugins/aiGateway/authSupabase.js'
import { runMeooAgentImageRequest } from '../vite-plugins/meooAgentImageCore.js'

export const config = { maxDuration: 300 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
  let user: Awaited<ReturnType<typeof verifyBearerJwt>>
  try {
    user = await verifyBearerJwt(auth, process.env as Record<string, string>)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendMerchantJson(res, 503, { ok: false, error: 'auth_lookup_failed', detail: msg.slice(0, 400) })
    return
  }
  if (!user) {
    sendMerchantJson(res, 401, { ok: false, error: 'unauthorized' })
    return
  }

  let body: {
    prompt?: unknown
    preferred_vendor?: unknown
    reference_image?: unknown
    image_route?: unknown
    tokenmix_image_model?: unknown
  }
  try {
    body = JSON.parse(rawBody(req) || '{}') as typeof body
  } catch {
    sendMerchantJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) {
    sendMerchantJson(res, 400, { ok: false, error: 'prompt_required' })
    return
  }
  const refRaw = typeof body.reference_image === 'string' ? body.reference_image.trim() : ''
  if (refRaw.length > 2_800_000) {
    sendMerchantJson(res, 400, { ok: false, error: 'reference_image_too_large' })
    return
  }
  const referenceImage = refRaw.length > 0 ? refRaw : undefined
  const pvRaw = typeof body.preferred_vendor === 'string' ? body.preferred_vendor.trim().toLowerCase() : ''
  const preferredVendor =
    pvRaw === 'qwen' || pvRaw === 'doubao' || pvRaw === 'minimax' ? (pvRaw as 'qwen' | 'doubao' | 'minimax') : undefined

  const routeRaw = typeof body.image_route === 'string' ? body.image_route.trim().toLowerCase() : ''
  const imageRoute = routeRaw === 'tokenmix' ? 'tokenmix' : 'builtin'
  const tokenmixImageModel =
    typeof body.tokenmix_image_model === 'string' ? body.tokenmix_image_model.trim() : undefined

  try {
    const out = await runMeooAgentImageRequest(process.env as Record<string, string>, {
      prompt,
      referenceImage,
      preferredVendor,
      imageRoute,
      tokenmixImageModel,
    })
    if (out.ok) {
      sendMerchantJson(res, 200, out)
    } else {
      sendMerchantJson(res, 502, { ok: false, error: 'image_generation_failed', detail: out.message })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[meoo-ai-agent-image] fatal', msg)
    sendMerchantJson(res, 500, { ok: false, error: 'internal_error', detail: msg.slice(0, 600) })
  }
}
