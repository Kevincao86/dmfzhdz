import {
  logAiChatServerLine,
  forwardAuditToMerchantAdmin,
  buildAuditPayload,
  summarizeText,
} from './auditLog.js'
import { sanitizeTokenUsage } from './aiJsonSafe.js'
import { routeAiChat } from './chatRouter.js'
import { prepareMeooAiChat } from './meooAiChatPrepare.js'
import { recordDirectAiUsageAfterSuccess } from '../tenantMembershipCore.js'
import { recordAiTokenUsageAfterSuccess, estimateLlmTokensFromText } from '../aiTokenUsageCore.js'
import {
  describeDirectLlmKeyDebug,
  formatDirectLlmKeyDebugHint,
} from './directLlmKeyDebug.js'
import { extractToolCallsFromChatRaw } from '../../src/lib/aiAgentTools/extractToolCalls.js'

export async function runMeooAiChatCore(
  bodyRaw: string,
  authHeader: string | undefined,
  env: Record<string, string>,
  mpSession?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  let wantsStream = false
  try {
    const peek = JSON.parse(bodyRaw || '{}') as { stream?: boolean }
    wantsStream = peek.stream === true
  } catch {
    return { status: 400, body: { ok: false, error: 'invalid_json' } }
  }
  if (wantsStream) {
    return { status: 400, body: { ok: false, error: 'use_sse_stream', detail: 'stream=true 须走 SSE 响应' } }
  }

  const prep = await prepareMeooAiChat(bodyRaw, authHeader, env, mpSession)
  if (!prep.ok) {
    return { status: prep.status, body: prep.body }
  }

  const { user, req, chatEnv, env: fullEnv, usageCtx } = prep
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
    const toolCalls =
      res.tool_calls?.length
        ? res.tool_calls
        : extractToolCallsFromChatRaw(res.raw)
    /** 勿把 SDK 完整 raw 对象写入 HTTP 响应：常含循环引用，JSON.stringify 会抛错导致 Vercel 500 */
    const okBody: Record<string, unknown> = {
      ok: true,
      provider: res.provider,
      model: res.model,
      content: res.content,
    }
    if (toolCalls.length) {
      // 服务端不执行工具：媒体/商品 OSS·ICE 留在浏览器会话由客户端执行
      okBody.tool_calls = toolCalls
    }
    const usageSafe = sanitizeTokenUsage(res.usage)
    if (usageSafe) okBody.usage = usageSafe
    void forwardAuditToMerchantAdmin({
      env: fullEnv,
      body: buildAuditPayload({ user, req, res, status: 'ok' }),
    })
    logAiChatServerLine({
      phase: 'response',
      userId: user.id,
      provider: res.provider,
      modelFamily: req.modelFamily ?? null,
      model: res.model,
      outputSummary: summarizeText(
        toolCalls.length
          ? `${res.content || ''} [tool_calls:${toolCalls.map((t) => t.function.name).join(',')}]`
          : res.content,
      ),
      tokenUsage: usageSafe ?? null,
      status: 'ok',
    })
    recordDirectAiUsageAfterSuccess(usageCtx, fullEnv)
    const inputText = lastUser?.content ?? ''
    void recordAiTokenUsageAfterSuccess({
      userId: user.id,
      usageCtx,
      tenantIdHint: req.tenantId,
      provider: res.provider,
      model: res.model,
      usage: usageSafe ?? estimateLlmTokensFromText(inputText, res.content),
      env: fullEnv,
    })
    return { status: 200, body: okBody }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    let registryKeys: unknown = null
    if (req.provider === 'kimi' || req.provider === 'minimax') {
      try {
        const { readMerchantSupabaseAdminEnv } = await import('../merchantSupabaseAdminEnv.js')
        const { supabaseUrl, serviceRole } = readMerchantSupabaseAdminEnv()
        if (supabaseUrl && serviceRole) {
          const { createRegistrySnapshotIoFetch } = await import('../../src/lib/registrySnapshotIoFetch.js')
          registryKeys = (await createRegistrySnapshotIoFetch(supabaseUrl, serviceRole).load()).vendorKeys
        }
      } catch {
        /* 诊断用，失败不阻断 */
      }
    }
    const keyDebug =
      req.provider === 'kimi' || req.provider === 'minimax'
        ? describeDirectLlmKeyDebug(req.provider, chatEnv, registryKeys)
        : null
    const detailWithDebug =
      keyDebug && /401|invalid api key|invalid authentication|2049/i.test(msg)
        ? `${msg.slice(0, 600)} ${formatDirectLlmKeyDebugHint(req.provider as 'kimi' | 'minimax', keyDebug)}`
        : msg.slice(0, 800)
    void forwardAuditToMerchantAdmin({
      env: fullEnv,
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
    const authHint = /401|invalid api key|invalid authentication|2049|JWT|TokenMix Key 与/i.test(msg)
      ? '上游 401：请核对运营台 Key 前缀（MiniMax/Kimi 均须 sk-，勿 eyJ JWT）；国内/国际域名须与账号一致。ECS 执行 git pull && sudo systemctl restart meoo-auth-api。探测：GET /erp-api/meoo-ai-vendor-keys-probe（Bearer MEOO_SUPPORT_OPS_HTTP_TOKEN）。'
      : /workspace endpoint access denied|workspace.*denied/i.test(msg)
        ? '通义千问业务空间域名与 API Key 不匹配：请清空 MERCHANT_AI_QWEN_BASE_URL / DASHSCOPE_BASE_URL 走公共 DashScope，或改为正确 maas 业务空间地址后重启 meoo-auth-api。'
        : undefined
    return {
      status: 502,
      body: {
        ok: false,
        error: 'upstream_error',
        detail: detailWithDebug,
        ...(keyDebug ? { keyDebug } : {}),
        ...(authHint ? { hint: authHint } : {}),
      },
    }
  }
}
