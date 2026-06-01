import { resolveAssistantVisibleText, splitAssistantStreamView } from '../../src/lib/assistantThinkingText.js'
import {
  buildAuditPayload,
  forwardAuditToMerchantAdmin,
  logAiChatServerLine,
  summarizeText,
} from './auditLog.js'
import { sanitizeTokenUsage } from './aiJsonSafe.js'
import { routeAiChatStream } from './chatStreamRouter.js'
import { prepareMeooAiChat } from './meooAiChatPrepare.js'
import {
  describeDirectLlmKeyDebug,
  formatDirectLlmKeyDebugHint,
} from './directLlmKeyDebug.js'

export type MeooAiChatSsePayload =
  | { event: 'thinking'; text: string }
  | { event: 'content'; text: string }
  | { event: 'done'; content: string; provider: string; model: string }
  | { event: 'error'; error: string; detail?: string; hint?: string }

export async function runMeooAiChatStream(
  bodyRaw: string,
  authHeader: string | undefined,
  env: Record<string, string>,
  write: (payload: MeooAiChatSsePayload) => void,
  signal?: AbortSignal,
): Promise<void> {
  const prep = await prepareMeooAiChat(bodyRaw, authHeader, env)
  if (!prep.ok) {
    write({
      event: 'error',
      error: String(prep.body.error ?? 'request_failed'),
      detail: typeof prep.body.detail === 'string' ? prep.body.detail : undefined,
      hint: typeof prep.body.hint === 'string' ? prep.body.hint : undefined,
    })
    return
  }

  const { user, req, chatEnv, env: fullEnv } = prep
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

  let rawContent = ''
  let reasoningAcc = ''

  const publishView = () => {
    const view = splitAssistantStreamView(rawContent)
    const thinking = [reasoningAcc, view.thinking].filter(Boolean).join('\n\n').trim()
    if (thinking) write({ event: 'thinking', text: thinking })
    const answer = resolveAssistantVisibleText(rawContent) || view.answer.trim()
    if (answer) write({ event: 'content', text: answer })
  }

  try {
    const res = await routeAiChatStream(
      req,
      chatEnv,
      (d) => {
        if (d.reasoning) reasoningAcc += d.reasoning
        if (d.content) rawContent += d.content
        publishView()
      },
      signal,
    )

    const usageSafe = sanitizeTokenUsage(res.usage)
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
      outputSummary: summarizeText(res.content),
      tokenUsage: usageSafe ?? null,
      status: 'ok',
    })
    write({
      event: 'done',
      content: resolveAssistantVisibleText(res.content) || res.content,
      provider: res.provider,
      model: res.model,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const provider = req.provider
    let registryKeys: unknown = null
    if (provider === 'kimi' || provider === 'minimax') {
      try {
        const { readMerchantSupabaseAdminEnv } = await import('../merchantSupabaseAdminEnv.js')
        const { supabaseUrl, serviceRole } = readMerchantSupabaseAdminEnv()
        if (supabaseUrl && serviceRole) {
          const { createRegistrySnapshotIoFetch } = await import('../../src/lib/registrySnapshotIoFetch.js')
          registryKeys = (await createRegistrySnapshotIoFetch(supabaseUrl, serviceRole).load()).vendorKeys
        }
      } catch {
        /* noop */
      }
    }
    const keyDebug =
      provider === 'kimi' || provider === 'minimax'
        ? describeDirectLlmKeyDebug(provider, chatEnv, registryKeys)
        : null
    const detailWithDebug =
      keyDebug && /401|invalid api key|invalid authentication|2049/i.test(msg)
        ? `${msg.slice(0, 600)} ${formatDirectLlmKeyDebugHint(provider as 'kimi' | 'minimax', keyDebug)}`
        : msg.slice(0, 800)
    void forwardAuditToMerchantAdmin({
      env: fullEnv,
      body: buildAuditPayload({ user, req, status: 'error', error: msg }),
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
      ? '上游 401：请核对运营台 Key 与 ECS auth-api。'
      : undefined
    write({
      event: 'error',
      error: 'upstream_error',
      detail: detailWithDebug,
      ...(authHint ? { hint: authHint } : {}),
    })
  }
}
