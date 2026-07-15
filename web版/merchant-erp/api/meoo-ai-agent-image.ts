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
import { verifyMpSessionToken } from '../vite-plugins/aiGateway/authMpSession.js'
import { assertAiChatAccess } from '../vite-plugins/tenantMembershipCore.js'
import { runMeooAgentImageRequest } from '../vite-plugins/meooAgentImageCore.js'

export const config = { maxDuration: 300 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mp-Session')
  if (req.method !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
  const mpSessionRaw = req.headers['x-mp-session']
  const mpSession = typeof mpSessionRaw === 'string' ? mpSessionRaw.trim() : ''
  let user: Awaited<ReturnType<typeof verifyBearerJwt>>
  try {
    user = await verifyBearerJwt(auth, process.env as Record<string, string>)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendMerchantJson(res, 503, { ok: false, error: 'auth_lookup_failed', detail: msg.slice(0, 400) })
    return
  }
  // 小程序只带 X-Mp-Session（无 Bearer JWT）时须单独校验，与 meoo-ai-chat 一致
  if (!user && mpSession) {
    try {
      user = await verifyMpSessionToken(mpSession, process.env as Record<string, string>)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      sendMerchantJson(res, 503, { ok: false, error: 'auth_lookup_failed', detail: msg.slice(0, 400) })
      return
    }
  }
  if (!user) {
    sendMerchantJson(res, 401, { ok: false, error: 'unauthorized' })
    return
  }

  let body: {
    prompt?: unknown
    preferred_vendor?: unknown
    preferred_model_id?: unknown
    reference_image?: unknown
    image_route?: unknown
    tokenmix_image_model?: unknown
    tenantId?: unknown
    exact_prompt?: unknown
    wanx_size?: unknown
    aspect_ratio?: unknown
    doubao_size?: unknown
    prefer_wanx_poster?: unknown
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
  const preferredModelId =
    typeof body.preferred_model_id === 'string' ? body.preferred_model_id.trim() : undefined
  const exactPrompt = body.exact_prompt === true
  const wanxSize = typeof body.wanx_size === 'string' ? body.wanx_size.trim() : undefined
  const arRaw = typeof body.aspect_ratio === 'string' ? body.aspect_ratio.trim() : ''
  const aspectRatio =
    arRaw === '1:1' || arRaw === '3:4' || arRaw === '4:3' || arRaw === '9:16' || arRaw === '16:9'
      ? arRaw
      : undefined
  const dsRaw = typeof body.doubao_size === 'string' ? body.doubao_size.trim().toUpperCase() : ''
  const doubaoSize = dsRaw === '1K' || dsRaw === '2K' || dsRaw === '4K' ? dsRaw : undefined
  const preferWanxPoster = body.prefer_wanx_poster === true

  const { mergeMerchantAiEnvWithRegistrySnapshot } = await import(
    '../vite-plugins/merchantRegistryVendorEnv.js'
  )
  const env0 = await mergeMerchantAiEnvWithRegistrySnapshot(
    process.cwd(),
    process.env as Record<string, string>,
  )
  const accessProvider =
    imageRoute === 'tokenmix'
      ? 'tokenmix'
      : preferredVendor ?? 'qwen'
  const userJwt =
    (typeof auth === 'string' && auth.startsWith('Bearer ')
      ? auth.slice('Bearer '.length).trim()
      : '') || mpSession || undefined
  const access = await assertAiChatAccess(
    user.id,
    accessProvider,
    env0,
    userJwt,
    typeof body.tenantId === 'string' ? body.tenantId.trim() : undefined,
  )
  if (!access.ok) {
    sendMerchantJson(res, access.status, {
      ok: false,
      error: access.error,
      detail: access.detail,
    })
    return
  }

  try {
    const out = await runMeooAgentImageRequest(access.envForChat, {
      prompt,
      referenceImage,
      preferredVendor,
      preferredModelId,
      imageRoute,
      tokenmixImageModel,
      exactPrompt,
      wanxSize,
      aspectRatio,
      doubaoSize,
      preferWanxPoster,
    })
    if (out.ok) {
      const { recordAiTokenUsageFromVercelRequest, estimateLlmTokensFromText } = await import(
        '../vite-plugins/aiTokenUsageCore.js'
      )
      const usageProvider = out.channel === 'tokenmix' ? 'tokenmix' : out.vendorUsed
      const usageModel = out.channel === 'tokenmix' ? out.displayModel : preferredModelId || null
      void recordAiTokenUsageFromVercelRequest(req, env0, {
        provider: usageProvider || accessProvider,
        model: usageModel ?? undefined,
        tenantIdHint: typeof body.tenantId === 'string' ? body.tenantId.trim() : undefined,
        inputText: prompt,
        outputText: 'image_generated',
        usage: estimateLlmTokensFromText(prompt, 'image'),
      })
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
