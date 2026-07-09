import {
  MAX_AI_CHAT_IMAGE_ATTACHMENTS,
  type AIChatRequest,
  type AIProvider,
} from '../../src/services/ai/types.js'
import { normalizeAiModelFamily } from '../../src/services/ai/tokenmixClient.js'
import { mergeSystemPrompt } from './auditLog.js'
import { verifyBearerJwt } from './authSupabase.js'
import { verifyMpSessionToken } from './authMpSession.js'
import { assertAiChatAccess } from '../tenantMembershipCore.js'
import { buildServerMerchantIntelContext } from '../merchantIntelServerCore.js'

const ALLOWED = new Set<string>(['tokenmix', 'deepseek', 'kimi', 'minimax', 'qwen', 'doubao'])

function bearerJwt(authHeader: string | undefined): string | undefined {
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : undefined
}

async function resolveChatUser(
  authHeader: string | undefined,
  mpSession: string | undefined,
  env: Record<string, string>,
): Promise<Awaited<ReturnType<typeof verifyBearerJwt>> | null> {
  const token = (mpSession || '').trim() || bearerJwt(authHeader)
  if (!token) return null
  try {
    const user = await verifyBearerJwt(`Bearer ${token}`, env)
    if (user) return user
  } catch {
    /* 非 Supabase JWT，尝试 mp 会话 */
  }
  return verifyMpSessionToken(token, env)
}

export type MeooAiChatPrepared =
  | {
      ok: true
      user: NonNullable<Awaited<ReturnType<typeof verifyBearerJwt>>>
      req: AIChatRequest
      chatEnv: Record<string, string>
      env: Record<string, string>
      usageCtx?: import('../tenantMembershipCore.js').TenantAiContext
    }
  | { ok: false; status: number; body: Record<string, unknown> }

export async function prepareMeooAiChat(
  bodyRaw: string,
  authHeader: string | undefined,
  env: Record<string, string>,
  mpSession?: string,
): Promise<MeooAiChatPrepared> {
  let parsed: Partial<AIChatRequest> & { messages?: AIChatRequest['messages'] }
  try {
    parsed = JSON.parse(bodyRaw || '{}') as Partial<AIChatRequest>
  } catch {
    return { ok: false, status: 400, body: { ok: false, error: 'invalid_json' } }
  }
  if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
    return { ok: false, status: 400, body: { ok: false, error: 'messages_required' } }
  }

  let user: Awaited<ReturnType<typeof verifyBearerJwt>>
  try {
    user = await resolveChatUser(authHeader, mpSession, env)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const hint = /fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(msg)
      ? '请在商户 ERP 的 Vercel 环境变量配置 SUPABASE_JWT_SECRET（与 ECS JWT_SECRET 相同），并 Redeploy。'
      : msg === 'supabase_anon_not_configured'
        ? '请配置 SUPABASE_ANON_KEY（或与 VITE_SUPABASE_ANON_KEY 相同）。'
        : undefined
    return {
      ok: false,
      status: 503,
      body: {
        ok: false,
        error: 'auth_lookup_failed',
        detail: msg.slice(0, 400),
        ...(hint ? { hint } : {}),
      },
    }
  }
  if (!user) {
    return { ok: false, status: 401, body: { ok: false, error: 'unauthorized' } }
  }

  const defProvider = (env.DEFAULT_AI_PROVIDER ?? 'tokenmix').trim() as AIProvider
  const provider = (parsed.provider ?? defProvider) as AIProvider
  if (!ALLOWED.has(provider)) {
    return { ok: false, status: 400, body: { ok: false, error: 'invalid_provider' } }
  }

  let chatEnv = env
  const access = await assertAiChatAccess(
    user.id,
    provider,
    env,
    bearerJwt(authHeader) || (mpSession || '').trim() || undefined,
    typeof parsed.tenantId === 'string' ? parsed.tenantId.trim() : undefined,
  )
  if (!access.ok) {
    return {
      ok: false,
      status: access.status,
      body: { ok: false, error: access.error, detail: access.detail },
    }
  }
  chatEnv = access.envForChat
  const usageCtx = access.usageCtx

  const rawModel = typeof parsed.model === 'string' ? parsed.model.trim() : ''
  const modelFamily = provider === 'tokenmix' ? normalizeAiModelFamily(parsed.modelFamily) : undefined

  const parsedImages = Array.isArray(parsed.imageDataUrls)
    ? parsed.imageDataUrls
        .filter((x): x is string => typeof x === 'string' && x.startsWith('data:image/'))
        .slice(0, MAX_AI_CHAT_IMAGE_ATTACHMENTS)
    : []
  /** 豆包 / 通义 / TokenMix 均支持多模态；此前仅 tokenmix 透传导致混剪素材分析「只见编号不见画面」 */
  const imageDataUrls =
    parsedImages.length > 0 &&
    (provider === 'tokenmix' || provider === 'doubao' || provider === 'qwen')
      ? parsedImages
      : undefined

  const taskType =
    typeof parsed.taskType === 'string' ? (parsed.taskType as AIChatRequest['taskType']) : undefined
  const taskTypes = Array.isArray(parsed.taskTypes)
    ? parsed.taskTypes.filter((t): t is NonNullable<AIChatRequest['taskType']> => typeof t === 'string')
    : undefined
  const clientHasIntel = parsed.messages.some(
    (m) => m.role === 'system' && /门店经营情报/.test(m.content),
  )

  let messagesWithIntel = parsed.messages
  // 闲聊：浏览器已注入本地情报，跳过服务端再查 Supabase（省 2～4 次 DB 往返）
  if (taskType && !clientHasIntel) {
    try {
      const intel = await buildServerMerchantIntelContext(user.id, env, taskType)
      if (intel?.trim()) {
        messagesWithIntel = [{ role: 'system', content: intel.trim() }, ...parsed.messages]
      }
    } catch {
      /* 情报注入失败不阻断对话 */
    }
  }

  const req: AIChatRequest = {
    provider,
    model: rawModel ? rawModel : undefined,
    ...(provider === 'tokenmix' ? { modelFamily } : {}),
    messages: mergeSystemPrompt(messagesWithIntel, {
      agentPickerKey: typeof parsed.agentPickerKey === 'string' ? parsed.agentPickerKey : undefined,
      taskType,
      taskTypes,
    }),
    ...(imageDataUrls?.length ? { imageDataUrls } : {}),
    temperature: parsed.temperature,
    stream: parsed.stream === true,
    taskType,
    ...(taskTypes?.length ? { taskTypes } : {}),
  }

  return { ok: true, user, req, chatEnv, env, usageCtx }
}
