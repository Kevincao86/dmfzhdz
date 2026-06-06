import type { AIModelFamily } from './types'
import { detectImageGenerationIntent } from './aiImageIntentRouting.js'
import { parseAiModelPickerKey, parseVendorTierAutoFromKey } from './modelRegistry.js'
import { normalizeAiModelFamily } from './tokenmixClient.js'
import { vendorTierAutoPickerKey } from '../../lib/vendorModelPool.js'

/**
 * 智能体模型下拉：文生图专用 key（`img::…`）。
 * - `img::v::…`：灵祺内置万相 / 豆包 / MiniMax（`/api/meoo-ai-agent-image`）。
 * - `img::m::家族::模型 id`：TokenMix 中继「图像生成」接口（须配置 TOKENMIX_API_KEY）。
 */
export type ParsedAgentImagePicker =
  | { kind: 'vendor'; vendor: 'qwen' | 'doubao' | 'minimax' | 'auto' }
  | { kind: 'vendor-model'; vendor: 'qwen' | 'doubao'; modelId: string }
  | { kind: 'style'; family: AIModelFamily; modelId: string }
  | { kind: 'brand-direct'; slug: 'kimi' | 'deepseek' }

export function parseAgentImagePickerKey(key: string): ParsedAgentImagePicker | null {
  const tierAuto = parseVendorTierAutoFromKey(key)
  if (tierAuto && (tierAuto.tier === 'image_text' || tierAuto.tier === 'vision')) {
    return { kind: 'vendor', vendor: tierAuto.vendor }
  }
  const parts = key.split('::')
  if (parts[0] !== 'img' || parts.length < 3) return null
  if (parts[1] === 'qwen' || parts[1] === 'doubao') {
    const modelId = parts.slice(2).join('::')
    if (!modelId) return null
    return { kind: 'vendor-model', vendor: parts[1], modelId }
  }
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

/** 内置生图路由（万相/豆包/MiniMax）或 TokenMix 图像模型 */
export type AgentNativeImageRoute =
  | { route: 'builtin'; preferredVendor?: 'qwen' | 'doubao' | 'minimax'; preferredModelId?: string }
  | { route: 'tokenmix'; tokenmixImageModel: string }

export function agentNativeImageRouteFromPickerKey(key: string): AgentNativeImageRoute {
  const p = parseAgentImagePickerKey(key)
  if (p?.kind === 'style') return { route: 'tokenmix', tokenmixImageModel: p.modelId }
  if (p?.kind === 'vendor-model') {
    return { route: 'builtin', preferredVendor: p.vendor, preferredModelId: p.modelId }
  }
  if (p?.kind === 'vendor') {
    if (p.vendor === 'auto') return { route: 'builtin' }
    return { route: 'builtin', preferredVendor: p.vendor }
  }
  if (p?.kind === 'brand-direct') return { route: 'builtin' }
  return { route: 'builtin' }
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
    if (p.vendor === 'qwen') return vendorTierAutoPickerKey('qwen', 'language')
    if (p.vendor === 'doubao') return vendorTierAutoPickerKey('doubao', 'language')
    if (p.vendor === 'minimax') return 'minimax::__default__'
    return 'tokenmix::openai::__default__'
  }
  if (p.kind === 'vendor-model') {
    return p.vendor === 'qwen'
      ? vendorTierAutoPickerKey('qwen', 'language')
      : vendorTierAutoPickerKey('doubao', 'language')
  }
  if (p.kind === 'style') return `tokenmix::${p.family}::__default__`
  if (p.kind === 'brand-direct') {
    return p.slug === 'kimi' ? 'kimi::__default__' : 'deepseek::__default__'
  }
  return 'tokenmix::openai::__default__'
}

export function effectiveChatPickerKey(modelPickerKey: string): string {
  return isAgentImagePickerKey(modelPickerKey) ? fallbackChatPickerKeyFromImagePicker(modelPickerKey) : modelPickerKey
}

/** 对话模型 → 同品牌文生图 picker（豆包文案 + 豆包 Seedream 等） */
export function imagePickerKeyForChatSelection(
  chatPickerKey: string,
  options: readonly { key: string; capability?: string }[],
): string {
  if (isAgentImagePickerKey(chatPickerKey)) return chatPickerKey
  const parsed = parseAiModelPickerKey(chatPickerKey)
  if (!parsed) {
    const auto = options.find((o) => o.key === 'img::v::auto')
    return auto?.key ?? 'img::v::auto'
  }
  if (parsed.provider === 'doubao') {
    const k = vendorTierAutoPickerKey('doubao', 'image_text')
    return options.some((o) => o.key === k) ? k : 'img::v::auto'
  }
  if (parsed.provider === 'qwen') {
    const k = vendorTierAutoPickerKey('qwen', 'image_text')
    return options.some((o) => o.key === k) ? k : 'img::v::auto'
  }
  if (parsed.provider === 'minimax') {
    const k = 'img::v::minimax'
    return options.some((o) => o.key === k) ? k : 'img::v::auto'
  }
  return options.find((o) => o.key === 'img::v::auto')?.key ?? 'img::v::auto'
}

/** 生图意图或附图时：若当前为对话模型，自动解析为文生图 picker */
export function resolveImagePickerKeyForUserLine(
  chatPickerKey: string,
  options: readonly { key: string; capability?: string }[],
  userLine: string,
  hasComposerImages: boolean,
): string {
  if (isAgentImagePickerKey(chatPickerKey)) return chatPickerKey
  if (!hasComposerImages && !detectImageGenerationIntent(userLine)) return chatPickerKey
  return imagePickerKeyForChatSelection(chatPickerKey, options)
}
