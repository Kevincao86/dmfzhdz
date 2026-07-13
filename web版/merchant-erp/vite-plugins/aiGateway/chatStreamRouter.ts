import type { AIChatRequest, AIChatResponse } from '../../src/services/ai/types.js'
import { resolveTokenMixModelId } from '../../src/services/ai/tokenmixClient.js'
import { registryEntry } from '../../src/services/ai/modelRegistry.js'
import { assertDistinctFromTokenMix, looksLikeJwtCredential } from '../../src/lib/aiVendorKeyValidate.js'
import { looksLikeMinimaxJwtKey } from '../merchantRegistryVendorEnv.js'
import {
  moonshotChatBaseCandidates,
  moonshotChatModelCandidates,
  resolveMoonshotApiKey,
  minimaxChatBaseCandidates,
  minimaxChatModelCandidates,
  resolveMinimaxApiKey,
} from './providers/directLlmEnv.js'
import { type OpenAiCompatMessage } from './providers/openAiCompatibleFetch.js'
import { openAiCompatChatStream, type OpenAiStreamDelta } from './openAiCompatStream.js'
import { toOpenAiChatCompletionMessages } from './openAiChatMessages.js'
import { streamBuiltinAgentChatFromMessages } from '../merchantAiUpstream.js'
import { isQuotaHopableError } from '../../src/lib/vendorModelPool.js'

export type AiStreamDeltaHandler = (delta: OpenAiStreamDelta) => void

function toOpenAiMessages(messages: AIChatRequest['messages']): OpenAiCompatMessage[] {
  return messages.map((m) => {
    if (m.role === 'tool') return { role: 'user', content: `[tool]\n${m.content}` }
    if (m.role === 'system') return { role: 'system', content: m.content }
    if (m.role === 'assistant') return { role: 'assistant', content: m.content }
    return { role: 'user', content: m.content }
  })
}

async function consumeGenerator(
  gen: AsyncGenerator<OpenAiStreamDelta>,
  onDelta: AiStreamDeltaHandler,
): Promise<void> {
  for await (const d of gen) {
    if (d.reasoning || d.content) onDelta(d)
  }
}

async function streamTokenMix(
  req: AIChatRequest,
  env: Record<string, string>,
  onDelta: AiStreamDeltaHandler,
  signal?: AbortSignal,
): Promise<{ model: string }> {
  const apiKey = (env.TOKENMIX_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('TOKENMIX_API_KEY 未配置')
  const baseRaw = (env.TOKENMIX_BASE_URL ?? 'https://api.tokenmix.ai/v1').trim().replace(/\/$/, '')
  const model = resolveTokenMixModelId({ modelFamily: req.modelFamily, model: req.model }, env)
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey, baseURL: baseRaw })
  const stream = await client.chat.completions.create({
    model,
    messages: toOpenAiChatCompletionMessages(req) as Parameters<
      typeof client.chat.completions.create
    >[0]['messages'],
    temperature: req.temperature ?? 0.7,
    stream: true,
  }, { signal })
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta
    if (!delta) continue
    const piece: OpenAiStreamDelta = {}
    const rc =
      (delta as { reasoning_content?: string }).reasoning_content ??
      (delta as { reasoning?: string }).reasoning
    if (typeof rc === 'string' && rc) piece.reasoning = rc
    if (typeof delta.content === 'string' && delta.content) piece.content = delta.content
    if (piece.reasoning || piece.content) onDelta(piece)
  }
  return { model: model }
}

function deepseekExtraBody(req: AIChatRequest): Record<string, unknown> {
  // 闲聊禁用 thinking，避免长时间只有「思考中」；经营类任务再开中等推理
  if (!req.taskType) return { thinking: { type: 'disabled' } }
  return { thinking: { type: 'enabled' }, reasoning_effort: 'medium' }
}

async function streamDeepseek(
  req: AIChatRequest,
  env: Record<string, string>,
  onDelta: AiStreamDeltaHandler,
  signal?: AbortSignal,
): Promise<{ model: string }> {
  const apiKey = (env.DEEPSEEK_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY 未配置')
  const reg = registryEntry('deepseek')
  const model = (req.model ?? env.DEEPSEEK_MODEL ?? reg?.defaultModel ?? 'deepseek-chat').trim()
  const base = (env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').trim().replace(/\/$/, '')
  await consumeGenerator(
    openAiCompatChatStream({
      url: `${base}/chat/completions`,
      apiKey,
      model,
      messages: toOpenAiMessages(req.messages),
      temperature: req.temperature ?? 0.6,
      extraBody: deepseekExtraBody(req),
      signal,
    }),
    onDelta,
  )
  return { model }
}

async function streamKimi(
  req: AIChatRequest,
  env: Record<string, string>,
  onDelta: AiStreamDeltaHandler,
  signal?: AbortSignal,
): Promise<{ model: string }> {
  const apiKey = resolveMoonshotApiKey(env)
  if (!apiKey) throw new Error('MOONSHOT_API_KEY 未配置')
  if (looksLikeJwtCredential(apiKey)) {
    throw new Error('Kimi Key 须为 sk- 开头 API Key，勿填 JWT')
  }
  assertDistinctFromTokenMix('Kimi', apiKey, env.TOKENMIX_API_KEY)
  const models = moonshotChatModelCandidates(env, req.model)
  const bases = moonshotChatBaseCandidates(env)
  const messages = toOpenAiMessages(req.messages)
  const baseURL = bases[0]
  const model = models[0]
  if (!baseURL || !model) throw new Error('Kimi: 未配置模型或 Base URL')
  try {
    await consumeGenerator(
      openAiCompatChatStream({
        url: `${baseURL.replace(/\/$/, '')}/chat/completions`,
        apiKey,
        model,
        messages,
        temperature: req.temperature ?? 0.6,
        signal,
      }),
      onDelta,
    )
    return { model }
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e))
  }
}

async function streamMinimax(
  req: AIChatRequest,
  env: Record<string, string>,
  onDelta: AiStreamDeltaHandler,
  signal?: AbortSignal,
): Promise<{ model: string }> {
  const apiKey = resolveMinimaxApiKey(env)
  if (!apiKey) throw new Error('MINIMAX_API_KEY 未配置')
  if (looksLikeMinimaxJwtKey(apiKey) || looksLikeJwtCredential(apiKey)) {
    throw new Error('MiniMax 须使用 sk- 开头接口密钥')
  }
  assertDistinctFromTokenMix('MiniMax', apiKey, env.TOKENMIX_API_KEY)
  const reg = registryEntry('minimax')
  const models = minimaxChatModelCandidates(env, req.model, reg?.defaultModel)
  const bases = minimaxChatBaseCandidates(env, apiKey)
  const messages = toOpenAiMessages(req.messages)
  const baseURL = bases[0]
  const model = models[0]
  if (!baseURL || !model) throw new Error('MiniMax: 未配置模型或 Base URL')
  const root = baseURL.replace(/\/$/, '')
  const url = root.includes('/chat/completions') ? root : `${root}/chat/completions`
  try {
    await consumeGenerator(
      openAiCompatChatStream({
        url,
        apiKey,
        model,
        messages,
        temperature: req.temperature ?? 1,
        signal,
      }),
      onDelta,
    )
    return { model }
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e))
  }
}

/**
 * 流式调用上游；onDelta 收到 reasoning / content 增量。
 * 返回聚合后的完整正文（供任务 JSON 解析）。
 */
export async function routeAiChatStream(
  req: AIChatRequest,
  env: Record<string, string>,
  onDelta: AiStreamDeltaHandler,
  signal?: AbortSignal,
): Promise<AIChatResponse> {
  let content = ''
  let reasoning = ''
  const wrap: AiStreamDeltaHandler = (d) => {
    if (d.reasoning) reasoning += d.reasoning
    if (d.content) content += d.content
    onDelta(d)
  }

  let modelUsed = req.model?.trim() || ''
  switch (req.provider) {
    case 'tokenmix': {
      const r = await streamTokenMix(req, env, wrap, signal)
      modelUsed = r.model
      break
    }
    case 'deepseek': {
      const r = await streamDeepseek(req, env, wrap, signal)
      modelUsed = r.model
      break
    }
    case 'kimi': {
      const r = await streamKimi(req, env, wrap, signal)
      modelUsed = r.model
      break
    }
    case 'minimax': {
      const r = await streamMinimax(req, env, wrap, signal)
      modelUsed = r.model
      break
    }
    case 'qwen':
    case 'doubao': {
      const primary = req.provider
      const alternate: 'doubao' | 'qwen' = primary === 'doubao' ? 'qwen' : 'doubao'
      let primaryErr = ''
      try {
        const r = await streamBuiltinAgentChatFromMessages(
          env,
          primary,
          req.model,
          req.messages,
          wrap,
          signal,
        )
        modelUsed = r.modelUsed
        break
      } catch (e) {
        primaryErr = e instanceof Error ? e.message : String(e)
        if (!isQuotaHopableError(primaryErr)) throw e
      }
      try {
        const r = await streamBuiltinAgentChatFromMessages(
          env,
          alternate,
          undefined,
          req.messages,
          wrap,
          signal,
        )
        modelUsed = r.modelUsed
        break
      } catch (e) {
        const altErr = e instanceof Error ? e.message : String(e)
        throw new Error(
          `${primaryErr}；${primary === 'doubao' ? '豆包' : '通义千问'}已自动切换${
            alternate === 'doubao' ? '豆包' : '通义千问'
          }仍失败：${altErr}`,
        )
      }
    }
    default:
      throw new Error(`unknown provider: ${String(req.provider)}`)
  }

  /** 任务 JSON 通常在正文；独立 reasoning 通道仅用于思考框，不写入 content */
  const full = content.trim() || reasoning.trim()

  return {
    provider: req.provider,
    model: modelUsed,
    content: full,
  }
}
