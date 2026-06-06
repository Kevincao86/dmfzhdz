import type { AIChatRequest, AIChatResponse } from '../../src/services/ai/types.js'
import { AI_AGENT_CASUAL_SYSTEM_PROMPT, AI_AGENT_SYSTEM_PROMPT } from '../../src/services/ai/types.js'
import { shouldUseFullAgentSystemPrompt } from '../../src/lib/aiAgentActionParse.js'
import { dialogueStyleAddonForPickerKey } from './agentDialogueStyle.js'
import { sanitizeTokenUsage } from './aiJsonSafe.js'

export type AuditStatus = 'ok' | 'error'

export function summarizeText(s: string, max = 400): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

export function logAiChatServerLine(payload: Record<string, unknown>): void {
  try {
    const safe = { ...payload }
    if ('tokenUsage' in safe) safe.tokenUsage = sanitizeTokenUsage(safe.tokenUsage) ?? null
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        channel: 'meoo_ai_chat',
        ...safe,
      }),
    )
  } catch {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        channel: 'meoo_ai_chat',
        phase: String(payload.phase ?? ''),
        status: 'log_serialize_skipped',
      }),
    )
  }
}

function buildAgentSystemContent(req: Pick<AIChatRequest, 'agentPickerKey'>): string {
  const style =
    typeof req.agentPickerKey === 'string' && req.agentPickerKey.trim()
      ? dialogueStyleAddonForPickerKey(req.agentPickerKey.trim())
      : ''
  return style ? `${AI_AGENT_SYSTEM_PROMPT}\n\n${style}` : AI_AGENT_SYSTEM_PROMPT
}

export function mergeSystemPrompt(
  messages: AIChatRequest['messages'],
  req?: Pick<AIChatRequest, 'agentPickerKey' | 'taskType'>,
): AIChatRequest['messages'] {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const userLine = typeof lastUser?.content === 'string' ? lastUser.content : ''
  const useFull = shouldUseFullAgentSystemPrompt(userLine, req?.taskType)
  const base = useFull ? buildAgentSystemContent(req ?? {}) : AI_AGENT_CASUAL_SYSTEM_PROMPT
  const first = messages[0]
  if (first?.role === 'system') {
    return [{ role: 'system', content: `${base}\n\n${first.content}` }, ...messages.slice(1)]
  }
  return [{ role: 'system', content: base }, ...messages]
}

export async function forwardAuditToMerchantAdmin(opts: {
  env: Record<string, string>
  body: Record<string, unknown>
}): Promise<void> {
  const base = (opts.env.MERCHANT_ADMIN_AI_AUDIT_URL ?? opts.env.VITE_MERCHANT_ADMIN_ORIGIN ?? '')
    .trim()
    .replace(/\/$/, '')
  const secret = (opts.env.MEOO_AI_AGENT_AUDIT_SECRET ?? '').trim()
  if (!base || !secret) return
  const url = `${base}/api/meoo-ai-agent-audit`
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-meoo-ai-audit-secret': secret,
      },
      body: JSON.stringify(opts.body),
    })
  } catch {
    /* 审计失败不影响主链路 */
  }
}

export function buildAuditPayload(parts: {
  user: { id: string; email?: string }
  req: AIChatRequest
  res?: AIChatResponse
  status: AuditStatus
  error?: string
}): Record<string, unknown> {
  const lastUser = [...parts.req.messages].reverse().find((m) => m.role === 'user')
  return {
    userId: parts.user.id,
    userLabel: parts.user.email ?? parts.user.id,
    taskType: parts.req.taskType ?? null,
    provider: parts.req.provider,
    modelFamily: parts.req.provider === 'tokenmix' ? (parts.req.modelFamily ?? null) : null,
    model: parts.res?.model ?? parts.req.model ?? null,
    inputSummary: summarizeText(lastUser?.content ?? ''),
    outputSummary: parts.res ? summarizeText(parts.res.content) : '',
    tokenUsage: sanitizeTokenUsage(parts.res?.usage) ?? null,
    executionStatus: parts.status,
    error: parts.error ?? null,
  }
}
