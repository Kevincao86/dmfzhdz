import type { AIModelFamily } from './types'
import { normalizeAiModelFamily } from './tokenmixClient.js'

/**
 * 智能体模型下拉：文生图专用 key（`img::…`），出图走 /api/meoo-ai-agent-image；
 * TokenMix 家族下的项为「展示分组」，底层仍由店魔方服务端万相/豆包/MiniMax 按环境变量出图。
 */
export type ParsedAgentImagePicker =
  | { kind: 'vendor'; vendor: 'qwen' | 'doubao' | 'minimax' | 'auto' }
  | { kind: 'style'; family: AIModelFamily; modelId: string }
  | { kind: 'brand-direct'; slug: 'kimi' | 'deepseek' }

export function parseAgentImagePickerKey(key: string): ParsedAgentImagePicker | null {
  const parts = key.split('::')
  if (parts[0] !== 'img' || parts.length < 3) return null
  if (parts[1] === 'v') {
    const v = parts[2]
    if (v === 'qwen' || v === 'doubao' || v === 'minimax' || v === 'auto') return { kind: 'vendor', vendor: v }
    return null
  }
  if (parts[1] === 'm' && parts[2]) {
    const fam = normalizeAiModelFamily(parts[2])
    const modelId = parts.slice(3).join('::')
    if (!modelId) return null
    return { kind: 'style', family: fam, modelId }
  }
  if (parts[1] === 'b' && (parts[2] === 'kimi' || parts[2] === 'deepseek')) {
    return { kind: 'brand-direct', slug: parts[2] }
  }
  return null
}

export function isAgentImagePickerKey(key: string): boolean {
  return parseAgentImagePickerKey(key) != null
}

/** 文生图 API 首选厂商；auto / 展示类不传，由服务端 MERCHANT_AI_GOODS_IMAGE_FAILOVER 决定 */
export function nativeImagePreferredVendorFromPicker(key: string): 'qwen' | 'doubao' | 'minimax' | undefined {
  const p = parseAgentImagePickerKey(key)
  if (!p || p.kind !== 'vendor') return undefined
  return p.vendor === 'auto' ? undefined : p.vendor
}

/** 文生图模型下对话回退 / 附图多模态时使用的 chat picker key */
export function fallbackChatPickerKeyFromImagePicker(key: string): string {
  const p = parseAgentImagePickerKey(key)
  if (!p) return 'tokenmix::openai::__default__'
  if (p.kind === 'vendor') {
    if (p.vendor === 'qwen') return 'qwen::__default__'
    if (p.vendor === 'doubao') return 'doubao::__default__'
    if (p.vendor === 'minimax') return 'minimax::__default__'
    return 'tokenmix::openai::__default__'
  }
  if (p.kind === 'style') return `tokenmix::${p.family}::__default__`
  return p.slug === 'kimi' ? 'kimi::__default__' : 'deepseek::__default__'
}

export function effectiveChatPickerKey(modelPickerKey: string): string {
  return isAgentImagePickerKey(modelPickerKey) ? fallbackChatPickerKeyFromImagePicker(modelPickerKey) : modelPickerKey
}
