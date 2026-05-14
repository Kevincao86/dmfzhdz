import type { AiModelPickerOption } from './modelRegistry'
import { parseAiModelPickerKey } from './modelRegistry'

/**
 * 附图理解 / 创意说明：仍走 chat 多模态（非像素级文生图）。
 */
const PREFERRED_MULTIMODAL_CHAT_KEYS = [
  'tokenmix::openai::gpt-4o',
  'tokenmix::gemini::gemini-2.5-flash',
  'tokenmix::claude::claude-sonnet-4.6',
] as const

/**
 * 用户显式要「出图」时：下拉优先展示可走服务端 wanx / Seedream / MiniMax 的直连项，
 * 避免误选仅 chat 的 GPT-4o 却期待像素图。
 */
const PREFERRED_PIXEL_GEN_PICKER_KEYS = [
  'qwen::__default__',
  'doubao::__default__',
  'minimax::__default__',
  'tokenmix::gemini::gemini-2.5-flash',
  'tokenmix::openai::gpt-4o',
] as const

const STRONG_MULTIMODAL_MODEL_IDS = new Set([
  'gpt-4o',
  'o4-mini',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'claude-sonnet-4.6',
  'claude-haiku-4.5',
  'claude-opus-4.7',
  'grok-4.1-fast-non-reasoning',
  'grok-4.1-fast-reasoning',
])

/** 用户是否在描述「要生成/设计画面」类需求（非仅含「图片」二字） */
export function detectImageGenerationIntent(text: string): boolean {
  const t = text.trim()
  if (t.length < 2) return false
  if (/生图|文生图|图生图|作图|出图|AI绘画|帮我画|画一张|画一幅|画个|P图|抠图|换背景/i.test(t)) return true
  if (/帮我生成|生成一张|生成一幅|生成个/i.test(t)) return true
  if (/生成.{0,24}(图|照片|图片|照|海报|门头|封面|插画|效果图|宣传图|店招|logo)/i.test(t)) return true
  if (/(?:设计|做|来).{0,10}(?:图|海报|门头|封面|店招|logo)/i.test(t)) return true
  if (/门头照|店招|宣传海报|封面图|配图|效果图|插画|海报设计|logo设计|文生|图生/i.test(t)) return true
  return false
}

function pickFirstAvailableKey(keySet: Set<string>, keys: readonly string[], fallback: string): string {
  for (const k of keys) {
    if (keySet.has(k)) return k
  }
  return fallback
}

/**
 * 在发送前根据文案 / 附图决定应使用的 modelPicker key；无需切换时返回 currentKey。
 * - 显式「生图」类：优先通义 / 豆包 / MiniMax（与 /api/meoo-ai-agent-image 一致），不再首推仅聊天的 GPT-4o。
 * - 仅附图、无生图文案：仍升路由至多模态 chat 模型。
 */
export function resolveModelPickerKeyForImageIntent(
  currentKey: string,
  options: readonly AiModelPickerOption[],
  userLine: string,
  hasComposerImages: boolean,
): string {
  const wantPixelGen = detectImageGenerationIntent(userLine)
  const needMultimodalChat = hasComposerImages || wantPixelGen
  if (!needMultimodalChat) return currentKey

  const keySet = new Set(options.map((o) => o.key))

  if (wantPixelGen) {
    return pickFirstAvailableKey(keySet, PREFERRED_PIXEL_GEN_PICKER_KEYS, currentKey)
  }

  const pickFirstMultimodal = (): string =>
    pickFirstAvailableKey(keySet, PREFERRED_MULTIMODAL_CHAT_KEYS, currentKey)

  const parsed = parseAiModelPickerKey(currentKey)

  if (parsed?.provider !== 'tokenmix') {
    return pickFirstMultimodal()
  }

  const mid = (parsed.model ?? '').trim()
  if (mid && STRONG_MULTIMODAL_MODEL_IDS.has(mid)) return currentKey

  if (parsed.modelFamily === 'openai') {
    if (!mid || mid === 'gpt-4o-mini' || mid === 'o3-mini') {
      const k = 'tokenmix::openai::gpt-4o'
      return keySet.has(k) ? k : pickFirstMultimodal()
    }
  }

  if (!mid) {
    return pickFirstMultimodal()
  }

  return pickFirstMultimodal()
}

/** 服务端文生图成功后，将下拉同步为对应直连厂商「默认」项（若存在）。 */
export function modelPickerKeyForNativeImageVendor(
  vendorUsed: 'qwen' | 'doubao' | 'minimax',
  options: readonly AiModelPickerOption[],
): string | null {
  const k =
    vendorUsed === 'qwen'
      ? 'qwen::__default__'
      : vendorUsed === 'doubao'
        ? 'doubao::__default__'
        : 'minimax::__default__'
  return options.some((o) => o.key === k) ? k : null
}
