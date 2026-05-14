/**
 * POST /api/meoo-ai-agent-image — 智能体文生图（服务端 wanx / Seedream / MiniMax，与商品 AI 共用 MERCHANT_AI_*）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  rawBody,
  sendMerchantJson,
} from './merchant/merchantGatewayShared.js'
import { verifyBearerJwt } from '../vite-plugins/aiGateway/authSupabase.js'
import { runAgentFreeformTextToImage } from '../vite-plugins/merchantAiUpstream.js'

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

  let body: { prompt?: unknown; preferred_vendor?: unknown }
  try {
    body = JSON.parse(rawBody(req) || '{}') as { prompt?: unknown; preferred_vendor?: unknown }
  } catch {
    sendMerchantJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) {
    sendMerchantJson(res, 400, { ok: false, error: 'prompt_required' })
    return
  }
  const pvRaw = typeof body.preferred_vendor === 'string' ? body.preferred_vendor.trim().toLowerCase() : ''
  const preferredVendor =
    pvRaw === 'qwen' || pvRaw === 'doubao' || pvRaw === 'minimax' ? (pvRaw as 'qwen' | 'doubao' | 'minimax') : undefined

  try {
    const out = await runAgentFreeformTextToImage(process.env as Record<string, string>, prompt, preferredVendor)
    if (out.ok) {
      sendMerchantJson(res, 200, {
        ok: true,
        imageUrl: out.imageUrl,
        vendorUsed: out.vendorUsed,
      })
    } else {
      sendMerchantJson(res, 502, { ok: false, error: 'image_generation_failed', detail: out.message })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[meoo-ai-agent-image] fatal', msg)
    sendMerchantJson(res, 500, { ok: false, error: 'internal_error', detail: msg.slice(0, 600) })
  }
}
