/**
 * 服务端智能体对话风格（勿从 src 再 import agentModelRoute，避免 Vercel 函数打包缺文件）。
 */
import type { AIModelFamily } from '../../src/services/ai/types.js'
import { normalizeAiModelFamily } from '../../src/services/ai/tokenmixClient.js'

function parseChatPickerKey(key: string): {
  provider: string
  family?: AIModelFamily
} | null {
  const parts = key.split('::')
  if (parts[0] === 'tokenmix' && parts.length >= 2) {
    return { provider: 'tokenmix', family: normalizeAiModelFamily(parts[1]) }
  }
  const p = parts[0]
  if (p === 'deepseek' || p === 'kimi' || p === 'minimax' || p === 'qwen' || p === 'doubao') {
    return { provider: p }
  }
  return null
}

function effectiveChatPickerKey(modelPickerKey: string): string {
  const k = modelPickerKey.trim()
  if (k.startsWith('img::m::')) {
    const parts = k.split('::')
    if (parts.length >= 4) return `tokenmix::${parts[2]}::${parts[3]}`
  }
  if (k.startsWith('img::v::')) return 'qwen::__default__'
  if (k.startsWith('img::b::')) {
    const parts = k.split('::')
    if (parts[2] === 'kimi') return 'kimi::__default__'
    if (parts[2] === 'minimax') return 'minimax::__default__'
    return 'qwen::__default__'
  }
  return k
}

/** 按用户所选模型追加简短对话风格说明 */
export function dialogueStyleAddonForPickerKey(pickerKey: string): string {
  const chatKey = effectiveChatPickerKey(pickerKey)
  const parsed = parseChatPickerKey(chatKey)
  if (!parsed) return ''

  if (parsed.provider === 'tokenmix') {
    switch (parsed.family) {
      case 'openai':
        return '使用 OpenAI 系列：结构清晰，要点分明，英文术语保留原文。'
      case 'claude':
        return '使用 Claude：条理分明，适当分点，语气专业克制。'
      case 'gemini':
        return '使用 Gemini：务实可执行，步骤与结论优先。'
      case 'grok':
        return '使用 Grok：直接爽快，可略带网感，避免冗长铺垫。'
      default:
        return ''
    }
  }
  if (parsed.provider === 'qwen') return '使用通义千问：中文表达自然、清晰。'
  if (parsed.provider === 'doubao') return '使用豆包：口语自然、易读。'
  if (parsed.provider === 'deepseek') return '使用 DeepSeek：简洁、逻辑清楚，少废话。'
  if (parsed.provider === 'kimi') return '使用 Kimi：长文也能收束，先结论后展开。'
  if (parsed.provider === 'minimax') return '使用 MiniMax：短句、好念，适合口播与活动话术。'
  return ''
}
