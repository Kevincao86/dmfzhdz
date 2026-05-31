import {
  MAX_AI_CHAT_IMAGE_ATTACHMENTS,
  type AIChatRequest,
  type AIProvider,
} from '../../src/services/ai/types.js'
import { normalizeAiModelFamily } from '../../src/services/ai/tokenmixClient.js'
import {
  mergeSystemPrompt,
  logAiChatServerLine,
  forwardAuditToMerchantAdmin,
  buildAuditPayload,
  summarizeText,
} from './auditLog.js'
import { verifyBearerJwt } from './authSupabase.js'
import { sanitizeTokenUsage } from './aiJsonSafe.js'
import { routeAiChat } from './chatRouter.js'
import { assertAiChatAccess } from '../tenantMembershipCore.js'
import { buildServerMerchantIntelContext } from '../merchantIntelServerCore.js'

const ALLOWED = new Set<string>(['tokenmix', 'deepseek', 'kimi', 'minimax', 'qwen', 'doubao'])

export async function runMeooAiChatCore(
  bodyRaw: string,
  authHeader: string | undefined,
  env: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  let parsed: Partial<AIChatRequest> & { messages?: AIChatRequest['messages'] }
  try {
    parsed = JSON.parse(bodyRaw || '{}') as Partial<AIChatRequest>
  } catch {
    return { status: 400, body: { ok: false, error: 'invalid_json' } }
  }
  if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
    return { status: 400, body: { ok: false, error: 'messages_required' } }
  }
  if (parsed.stream === true) {
    return { status: 501, body: { ok: false, error: 'stream_not_implemented' } }
  }

  let user: Awaited<ReturnType<typeof verifyBearerJwt>>
  try {
    user = await verifyBearerJwt(authHeader, env)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const hint = /fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(msg)
      ? '请在商户 ERP 的 Vercel 环境变量配置 SUPABASE_JWT_SECRET（与 ECS JWT_SECRET 相同），并 Redeploy。'
      : msg === 'supabase_anon_not_configured'
        ? '请配置 SUPABASE_ANON_KEY（或与 VITE_SUPABASE_ANON_KEY 相同）。'
        : undefined
    return {
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
    return { status: 401, body: { ok: false, error: 'unauthorized' } }
  }

  const defProvider = (env.DEFAULT_AI_PROVIDER ?? 'tokenmix').trim() as AIProvider
  const provider = (parsed.provider ?? defProvider) as AIProvider
  if (!ALLOWED.has(provider)) {
    return { status: 400, body: { ok: false, error: 'invalid_provider' } }
  }

  let chatEnv = env
  try {
    const access = await assertAiChatAccess(user.id, provider, env)
    if (!access.ok) {
      return {
        status: access.status,
        body: { ok: false, error: access.error, detail: access.detail },
      }
    }
    chatEnv = access.envForChat
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { status: 503, body: { ok: false, error: 'access_check_failed', detail: msg.slice(0, 400) } }
  }

  const rawModel = typeof parsed.model === 'string' ? parsed.model.trim() : ''
  const modelFamily = provider === 'tokenmix' ? normalizeAiModelFamily(parsed.modelFamily) : undefined

  /** 附图仅 TokenMix（四大家族）路径消费；直连 Kimi/MiniMax/DeepSeek 保持纯文本，与历史行为一致 */
  const imageDataUrls =
    provider === 'tokenmix' && Array.isArray(parsed.imageDataUrls)
      ? parsed.imageDataUrls
          .filter((x): x is string => typeof x === 'string' && x.startsWith('data:image/'))
          .slice(0, MAX_AI_CHAT_IMAGE_ATTACHMENTS)
      : undefined

  let messagesWithIntel = parsed.messages
  try {
    const intel = await buildServerMerchantIntelContext(
      user.id,
      env,
      typeof parsed.taskType === 'string' ? (parsed.taskType as AIChatRequest['taskType']) : undefined,
    )
    if (intel?.trim()) {
      messagesWithIntel = [{ role: 'system', content: intel.trim() }, ...parsed.messages]
    }
  } catch {
    /* 情报注入失败不阻断对话 */
  }

  const req: AIChatRequest = {
    provider,
    model: rawModel ? rawModel : undefined,
    ...(provider === 'tokenmix' ? { modelFamily } : {}),
    messages: mergeSystemPrompt(messagesWithIntel, {
      agentPickerKey: typeof parsed.agentPickerKey === 'string' ? parsed.agentPickerKey : undefined,
    }),
    ...(imageDataUrls?.length ? { imageDataUrls } : {}),
    temperature: parsed.temperature,
    stream: false,
    taskType: parsed.taskType,
  }

  const lastUser = [...req.messages].reverse().find((m) => m.role === 'user')
  logAiChatServerLine({
    phase: 'request',
    userId: user.id,
    provider: req.provider,
    modelFamily: req.modelFamily ?? null,
    model: req.model ?? null,
    inputSummary: summarizeText(lastUser?.content ?? ''),
    taskType: req.taskType ?? null,
  })

  try {
    const res = await routeAiChat(req, chatEnv)
    /** 勿把 SDK 完整 raw 对象写入 HTTP 响应：常含循环引用，JSON.stringify 会抛错导致 Vercel 500 */
    const okBody: Record<string, unknown> = {
      ok: true,
      provider: res.provider,
      model: res.model,
      content: res.content,
    }
    const usageSafe = sanitizeTokenUsage(res.usage)
    if (usageSafe) okBody.usage = usageSafe
    void forwardAuditToMerchantAdmin({
      env,
      body: buildAuditPayload({ user, req, res, status: 'ok' }),
    })
    logAiChatServerLine({
      phase: 'response',
      userId: user.id,
      provider: res.provider,
      modelFamily: req.modelFamily ?? null,
      model: res.model,
      outputSummary: summarizeText(res.content),
      tokenUsage: usageSafe ?? null,
      status: 'ok',
    })
    return { status: 200, body: okBody }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    void forwardAuditToMerchantAdmin({
      env,
      body: buildAuditPayload({
        user,
        req,
        status: 'error',
        error: msg,
      }),
    })
    logAiChatServerLine({
      phase: 'error',
      userId: user.id,
      provider: req.provider,
      modelFamily: req.modelFamily ?? null,
      model: req.model ?? null,
      inputSummary: summarizeText(lastUser?.content ?? ''),
      status: 'error',
      detail: msg.slice(0, 500),
    })
    return { status: 502, body: { ok: false, error: 'upstream_error', detail: msg.slice(0, 800) } }
  }
}
