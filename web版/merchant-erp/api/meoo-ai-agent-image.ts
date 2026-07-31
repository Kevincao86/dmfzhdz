/**
 * POST /api/meoo-ai-agent-image — 智能体文生图 / 图生图。
 * - builtin：万相 / 豆包 / MiniMax（MERCHANT_AI_*）。
 * - tokenmix：TokenMix OpenAI 兼容 images/generations（须 TOKENMIX_API_KEY）；有参考图时走内置图生图。
 * - phase=start|poll：GPT Image 异步短请求（避免浏览器长连接 Failed to fetch）；禁止回退万相。
 * - phase=fetch：同源代拉 TokenMix CDN（浏览器无 CORS，否则裁切 Failed to fetch）。
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
import {
  hydrateTokenmixImageUrlForBrowser,
  isTokenmixBrowserUnsafeImageUrl,
} from '../vite-plugins/aiGateway/tokenmixImageGenerate.js'
import {
  runMeooAgentImagePollTokenmix,
  runMeooAgentImageRequest,
  runMeooAgentImageStartTokenmix,
  type MeooAgentImageResult,
} from '../vite-plugins/meooAgentImageCore.js'

export const config = { maxDuration: 300 }

async function embedTokenmixImageForBrowser<T extends Extract<MeooAgentImageResult, { ok: true }>>(
  out: T,
): Promise<T> {
  if (!('imageUrl' in out) || typeof out.imageUrl !== 'string') return out
  if (!isTokenmixBrowserUnsafeImageUrl(out.imageUrl)) return out
  const dataUrl = await hydrateTokenmixImageUrlForBrowser(out.imageUrl)
  return { ...out, imageUrl: dataUrl }
}

async function sendImageSuccess(
  req: VercelRequest,
  res: VercelResponse,
  opts: {
    out: Extract<MeooAgentImageResult, { ok: true }>
    env0: Record<string, string>
    auth: string | undefined
    accessProvider: string
    preferredModelId?: string
    prompt: string
    isMpSession: boolean
    erpTenantId?: string
    wantsProImage: boolean
    chargeIdempotencyKey?: string
  },
): Promise<void> {
  let { out } = opts
  if ('pending' in out && out.pending) {
    sendMerchantJson(res, 200, out)
    return
  }

  try {
    out = await embedTokenmixImageForBrowser(out)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[meoo-ai-agent-image] tokenmix hydrate failed', msg)
    sendMerchantJson(res, 502, {
      ok: false,
      error: 'image_hydrate_failed',
      detail: msg.slice(0, 400),
    })
    return
  }

  const { recordAiTokenUsageFromVercelRequest, estimateLlmTokensFromText } = await import(
    '../vite-plugins/aiTokenUsageCore.js'
  )
  const usageProvider = out.channel === 'tokenmix' ? 'tokenmix' : out.vendorUsed
  const usageModel = out.channel === 'tokenmix' ? out.displayModel : opts.preferredModelId || null
  void recordAiTokenUsageFromVercelRequest(req, opts.env0, {
    provider: usageProvider || opts.accessProvider,
    model: usageModel ?? undefined,
    inputText: opts.prompt,
    outputText: 'image_generated',
    usage: estimateLlmTokensFromText(opts.prompt, 'image'),
  })
  let pointsCharged: number | undefined
  let pointsBalance: number | undefined
  if (!opts.isMpSession && opts.erpTenantId && 'imageUrl' in out) {
    const { chargeErpAiPointsAfterSuccess } = await import('./_lib/erpAiApiPointsGate.js')
    const chargeKind =
      opts.wantsProImage && out.channel === 'tokenmix' ? 'visual_studio_image_pro' : 'agent_image'
    const charge = await chargeErpAiPointsAfterSuccess(opts.auth, chargeKind, opts.env0, {
      tenantId: opts.erpTenantId,
      idempotencyKey:
        opts.chargeIdempotencyKey?.trim() ||
        `${chargeKind}:${opts.erpTenantId}:${Date.now().toString(36)}`,
      note: chargeKind === 'visual_studio_image_pro' ? 'AI 视觉工坊高级生图' : 'AI 智能体生图',
    })
    if (charge) {
      pointsCharged = charge.pointsCharged
      pointsBalance = charge.balance
    }
  }
  sendMerchantJson(res, 200, {
    ...out,
    ...(pointsCharged != null ? { pointsCharged, pointsBalance } : {}),
  })
}

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
    phase?: unknown
    task_id?: unknown
    image_url?: unknown
  }
  try {
    body = JSON.parse(rawBody(req) || '{}') as typeof body
  } catch {
    sendMerchantJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }

  const phaseRaw = typeof body.phase === 'string' ? body.phase.trim().toLowerCase() : ''
  const phase =
    phaseRaw === 'start' || phaseRaw === 'poll' || phaseRaw === 'fetch' ? phaseRaw : 'sync'
  const taskId = typeof body.task_id === 'string' ? body.task_id.trim() : ''
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const fetchImageUrl = typeof body.image_url === 'string' ? body.image_url.trim() : ''

  if (phase === 'fetch') {
    if (!fetchImageUrl || !isTokenmixBrowserUnsafeImageUrl(fetchImageUrl)) {
      sendMerchantJson(res, 400, {
        ok: false,
        error: 'image_url_not_allowed',
        message: '仅允许代拉 TokenMix 成图地址',
      })
      return
    }
    try {
      const dataUrl = await hydrateTokenmixImageUrlForBrowser(fetchImageUrl)
      sendMerchantJson(res, 200, { ok: true, imageUrl: dataUrl, channel: 'tokenmix' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      sendMerchantJson(res, 502, { ok: false, error: 'image_fetch_failed', detail: msg.slice(0, 400) })
    }
    return
  }

  if (phase !== 'poll' && !prompt) {
    sendMerchantJson(res, 400, { ok: false, error: 'prompt_required' })
    return
  }
  if (phase === 'poll' && !taskId) {
    sendMerchantJson(res, 400, { ok: false, error: 'task_id_required' })
    return
  }

  const refRaw = typeof body.reference_image === 'string' ? body.reference_image.trim() : ''
  if (refRaw.length > 2_800_000) {
    sendMerchantJson(res, 400, {
      ok: false,
      error: 'reference_image_too_large',
      message: '参考图过大，请压缩后再试（建议边长不超过 1280 像素）',
    })
    return
  }
  const referenceImage = refRaw.length > 0 ? refRaw : undefined
  const pvRaw = typeof body.preferred_vendor === 'string' ? body.preferred_vendor.trim().toLowerCase() : ''
  const preferredVendor =
    pvRaw === 'qwen' || pvRaw === 'doubao' || pvRaw === 'minimax' ? (pvRaw as 'qwen' | 'doubao' | 'minimax') : undefined

  const routeRaw = typeof body.image_route === 'string' ? body.image_route.trim().toLowerCase() : ''
  const imageRoute = routeRaw === 'tokenmix' || phase === 'start' || phase === 'poll' ? 'tokenmix' : 'builtin'
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
  const wantsProImage =
    imageRoute === 'tokenmix' && /^gpt-image/i.test(tokenmixImageModel || 'gpt-image-2')
  const accessProvider =
    imageRoute === 'tokenmix'
      ? 'tokenmix'
      : preferredVendor ?? 'qwen'
  const userJwt =
    (typeof auth === 'string' && auth.startsWith('Bearer ')
      ? auth.slice('Bearer '.length).trim()
      : '') || mpSession || undefined
  let access = await assertAiChatAccess(
    user.id,
    accessProvider,
    env0,
    userJwt,
    typeof body.tenantId === 'string' ? body.tenantId.trim() : undefined,
  )
  // 视觉工坊高级生图按积分计费（150/张），不要求会员 Plus 才开 TokenMix 对话模型
  if (
    !access.ok &&
    wantsProImage &&
    (access.error === 'plan_model_restricted' || access.error === 'tokenmix_requires_plus')
  ) {
    const tmKey = (env0.TOKENMIX_API_KEY ?? '').trim()
    if (tmKey) {
      access = { ok: true, envForChat: { ...env0, TOKENMIX_API_KEY: tmKey } }
    }
  }
  if (!access.ok) {
    sendMerchantJson(res, access.status, {
      ok: false,
      error: access.error,
      detail: access.detail,
    })
    return
  }

  const isMpSession = user.id.startsWith('mp:')
  let erpTenantId: string | undefined
  const erpPointsKind = wantsProImage ? 'visual_studio_image_pro' : 'agent_image'

  // poll：只查任务，积分在完成时扣；start/sync：先校验余额
  if (!isMpSession && phase !== 'poll') {
    const { requireErpAiPointsAffordable, sendErpAiPointsGateError } = await import(
      './_lib/erpAiApiPointsGate.js'
    )
    const gate = await requireErpAiPointsAffordable(auth, erpPointsKind, env0, {
      tenantIdHint: typeof body.tenantId === 'string' ? body.tenantId.trim() : undefined,
    })
    if (!gate.ok) {
      sendErpAiPointsGateError(res, sendMerchantJson, gate)
      return
    }
    erpTenantId = gate.tenantId
  } else if (!isMpSession && phase === 'poll') {
    // 完成扣费时需要 tenantId；poll 再轻量解析一次
    const { requireErpAiPointsAffordable } = await import('./_lib/erpAiApiPointsGate.js')
    const gate = await requireErpAiPointsAffordable(auth, erpPointsKind, env0, {
      tenantIdHint: typeof body.tenantId === 'string' ? body.tenantId.trim() : undefined,
    })
    if (gate.ok) erpTenantId = gate.tenantId
  }

  try {
    let out: MeooAgentImageResult
    if (phase === 'start') {
      out = await runMeooAgentImageStartTokenmix(access.envForChat, {
        prompt,
        tokenmixImageModel: tokenmixImageModel || 'gpt-image-2',
        wanxSize,
      })
    } else if (phase === 'poll') {
      out = await runMeooAgentImagePollTokenmix(access.envForChat, {
        taskId,
        tokenmixImageModel: tokenmixImageModel || 'gpt-image-2',
      })
    } else {
      out = await runMeooAgentImageRequest(access.envForChat, {
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
    }

    if (!out.ok) {
      sendMerchantJson(res, 502, { ok: false, error: 'image_generation_failed', detail: out.message })
      return
    }

    const resolvedTaskId =
      taskId ||
      ('taskId' in out && typeof out.taskId === 'string' ? out.taskId.trim() : '')
    await sendImageSuccess(req, res, {
      out,
      env0,
      auth,
      accessProvider,
      preferredModelId,
      prompt: prompt || `tokenmix-task:${resolvedTaskId || 'sync'}`,
      isMpSession,
      erpTenantId,
      wantsProImage,
      chargeIdempotencyKey:
        wantsProImage && resolvedTaskId
          ? `visual_studio_image_pro:${erpTenantId || user.id}:${resolvedTaskId}`
          : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[meoo-ai-agent-image] fatal', msg)
    sendMerchantJson(res, 500, { ok: false, error: 'internal_error', detail: msg.slice(0, 600) })
  }
}
