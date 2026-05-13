import type { AIChatRequest, AIProvider } from '../../src/services/ai/types.js'
import { mergeSystemPrompt, logAiChatServerLine, forwardAuditToMerchantAdmin, buildAuditPayload } from './auditLog.js'
import { verifyBearerJwt } from './authSupabase.js'
import { routeAiChat } from './chatRouter.js'

const ALLOWED = new Set<string>(['openai', 'anthropic', 'xai', 'deepseek', 'kimi'])

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

  const user = await verifyBearerJwt(authHeader, env)
  if (!user) {
    return { status: 401, body: { ok: false, error: 'unauthorized' } }
  }

  const defProvider = (env.DEFAULT_AI_PROVIDER ?? 'openai').trim() as AIProvider
  const provider = (parsed.provider ?? defProvider) as AIProvider
  if (!ALLOWED.has(provider)) {
    return { status: 400, body: { ok: false, error: 'invalid_provider' } }
  }

  const req: AIChatRequest = {
    provider,
    model: parsed.model,
    messages: mergeSystemPrompt(parsed.messages),
    temperature: parsed.temperature,
    stream: false,
    taskType: parsed.taskType,
  }

  logAiChatServerLine({
    phase: 'request',
    userId: user.id,
    provider: req.provider,
    taskType: req.taskType ?? null,
  })

  try {
    const res = await routeAiChat(req, env)
    const okBody = { ok: true as const, ...res }
    void forwardAuditToMerchantAdmin({
      env,
      body: buildAuditPayload({ user, req, res, status: 'ok' }),
    })
    logAiChatServerLine({
      phase: 'response',
      userId: user.id,
      provider: res.provider,
      model: res.model,
      status: 'ok',
    })
    return { status: 200, body: okBody as unknown as Record<string, unknown> }
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
      status: 'error',
      detail: msg.slice(0, 500),
    })
    return { status: 502, body: { ok: false, error: 'upstream_error', detail: msg.slice(0, 800) } }
  }
}
