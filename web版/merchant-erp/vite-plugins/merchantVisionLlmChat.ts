/**
 * 多模态视觉对话（通义 qwen-vl / 豆包视觉 / TokenMix），供 routeAiChat 与回链核查共用。
 * 纯文本模型（merchantAgentChatFromMessages）无法读图，附图须走本模块。
 */
import type { AIChatRequest, AIChatResponse, AIMessage } from '../src/services/ai/types.js'
import { chatTokenMix } from './aiGateway/providers/tokenmix.js'
import { estimateLlmTokensFromText } from './aiTokenUsageCore.js'

function flattenMessages(messages: AIMessage[]): { system: string; user: string } {
  const sys: string[] = []
  const dial: string[] = []
  for (const m of messages) {
    if (m.role === 'system') sys.push(m.content)
    else if (m.role === 'user') dial.push(m.content)
    else if (m.role === 'assistant') dial.push(`助手：${m.content}`)
    else dial.push(`${m.role}：${m.content}`)
  }
  return {
    system: sys.join('\n\n').trim() || 'You are a helpful assistant.',
    user: dial.join('\n\n').trim() || '（见附图）',
  }
}

function extractChatCompletionText(data: Record<string, unknown>): string {
  const choices = data.choices as unknown[] | undefined
  const first = choices?.[0] as Record<string, unknown> | undefined
  const message = first?.message as Record<string, unknown> | undefined
  if (typeof message?.content === 'string') return message.content.trim()
  const output = data.output as Record<string, unknown> | undefined
  if (typeof output?.text === 'string') return output.text.trim()
  return ''
}

function doubaoArkApiV3Root(env: Record<string, string>): string {
  const raw = (env.MERCHANT_AI_DOUBAO_ARK_BASE ?? '').trim().replace(/\/$/, '')
  if (!raw) return 'https://ark.cn-beijing.volces.com/api/v3'
  if (raw.endsWith('/api/v3')) return raw
  return `${raw}/api/v3`
}

async function openAiVisionChat(
  url: string,
  apiKey: string,
  model: string,
  system: string,
  userText: string,
  imageDataUrls: string[],
): Promise<string> {
  const imgs = imageDataUrls.filter((u) => u.startsWith('data:image/')).slice(0, 8)
  const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = []
  for (const urlImg of imgs) {
    userContent.push({ type: 'image_url', image_url: { url: urlImg } })
  }
  userContent.push({ type: 'text', text: userText })
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      temperature: 0,
      stream: false,
    }),
    signal: AbortSignal.timeout(55_000),
  })
  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    const errObj = data.error as { message?: string } | undefined
    throw new Error(
      (typeof errObj?.message === 'string' && errObj.message) ||
        (typeof data.message === 'string' && data.message) ||
        `视觉模型 HTTP ${res.status}`,
    )
  }
  const text = extractChatCompletionText(data)
  if (!text) throw new Error('视觉模型返回为空')
  return text
}

function visionImages(req: AIChatRequest): string[] {
  return (req.imageDataUrls ?? []).filter((u) => typeof u === 'string' && u.startsWith('data:image/'))
}

export function requestHasVisionImages(req: AIChatRequest): boolean {
  return visionImages(req).length > 0
}

/** 附图对话：优先豆包/通义视觉模型；TokenMix 可用时亦可走 gpt-4o 等 */
export async function chatVisionAgentFromRequest(
  req: AIChatRequest,
  env: Record<string, string>,
  prefer: 'doubao' | 'qwen' = 'qwen',
): Promise<AIChatResponse> {
  const imgs = visionImages(req)
  if (!imgs.length) throw new Error('缺少有效图片数据')
  const { system, user } = flattenMessages(req.messages)
  const modelOverride = req.model?.trim() || undefined

  const tokenmixKey = (env.TOKENMIX_API_KEY ?? '').trim()
  if (tokenmixKey && prefer === 'doubao') {
    try {
      const res = await chatTokenMix(
        {
          ...req,
          provider: 'tokenmix',
          modelFamily: 'openai',
          model: modelOverride || (env.MERCHANT_AI_MENU_VISION_MODEL ?? 'gpt-4o').trim() || 'gpt-4o',
          imageDataUrls: imgs,
        },
        env,
      )
      return res
    } catch {
      /* fall through to direct VL */
    }
  }

  const tryQwen = async (): Promise<AIChatResponse> => {
    const qwenKey = (env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim()
    if (!qwenKey) throw new Error('未配置通义视觉 Key')
    const models = [
      modelOverride,
      (env.MERCHANT_AI_QWEN_VL_MODEL ?? '').trim(),
      (env.MERCHANT_AI_ICE_VERIFY_MODEL ?? '').trim(),
      'qwen3-vl-plus',
      'qwen-vl-max',
      'qwen2.5-vl-72b-instruct',
      'qwen-vl-plus',
    ].filter(Boolean) as string[]
    let lastErr: Error | null = null
    for (const mid of [...new Set(models)]) {
      try {
        const text = await openAiVisionChat(
          'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
          qwenKey,
          mid,
          system,
          user,
          imgs,
        )
        return {
          provider: 'qwen',
          model: mid,
          content: text,
          usage: estimateLlmTokensFromText(`${system}\n${user}`, text),
        }
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e))
      }
    }
    throw lastErr ?? new Error('通义视觉模型调用失败')
  }

  const tryDoubao = async (): Promise<AIChatResponse> => {
    const doubaoKey = (env.MERCHANT_AI_DOUBAO_KEY ?? env.ARK_API_KEY ?? '').trim()
    if (!doubaoKey) throw new Error('未配置豆包视觉 Key')
    const models = [
      modelOverride,
      (env.MERCHANT_AI_DOUBAO_VL_MODEL ?? '').trim(),
      (env.MERCHANT_AI_ICE_VERIFY_MODEL ?? '').trim(),
      'doubao-seed-1-6-vision-250815',
      'doubao-1-5-vision-pro-32k-250115',
    ].filter(Boolean) as string[]
    let lastErr: Error | null = null
    for (const mid of [...new Set(models)]) {
      try {
        const text = await openAiVisionChat(
          `${doubaoArkApiV3Root(env)}/chat/completions`,
          doubaoKey,
          mid,
          system,
          user,
          imgs,
        )
        return {
          provider: 'doubao',
          model: mid,
          content: text,
          usage: estimateLlmTokensFromText(`${system}\n${user}`, text),
        }
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e))
      }
    }
    throw lastErr ?? new Error('豆包视觉模型调用失败')
  }

  const order = prefer === 'qwen' ? [tryQwen, tryDoubao] : [tryDoubao, tryQwen]
  let lastErr: Error | null = null
  for (const fn of order) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastErr ?? new Error('视觉模型不可用')
}
