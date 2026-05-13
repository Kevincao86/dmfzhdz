import type { AiModelPickerOption } from './modelRegistry'
import { parseAiModelPickerKey } from './modelRegistry'

/**
 * 智能体对话仍为 chat/completions；此处「可生图」指多模态/视觉与创意说明能力更强的路由，
 * 便于理解附图与作图类需求（真正像素级出图需后续接 images API）。
 */
const PREFERRED_VISUAL_TASK_KEYS = [
  'tokenmix::openai::gpt-4o',
  'tokenmix::gemini::gemini-2.0-flash',
  'tokenmix::claude::claude-3-5-sonnet-20241022',
] as const

const STRONG_MULTIMODAL_MODEL_IDS = new Set([
  'gpt-4o',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'claude-3-5-sonnet-20241022',
  'claude-3-opus-20240229',
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

/**
 * 在发送前根据文案 / 附图决定应使用的 modelPicker key；无需切换时返回 currentKey。
 */
export function resolveModelPickerKeyForImageIntent(
  currentKey: string,
  options: readonly AiModelPickerOption[],
  userLine: string,
  hasComposerImages: boolean,
): string {
  const needVisualRoute = hasComposerImages || detectImageGenerationIntent(userLine)
  if (!needVisualRoute) return currentKey

  const keySet = new Set(options.map((o) => o.key))
  const pickFirstPreferred = (): string => {
    for (const k of PREFERRED_VISUAL_TASK_KEYS) {
      if (keySet.has(k)) return k
    }
    return currentKey
  }

  const parsed = parseAiModelPickerKey(currentKey)

  if (parsed?.provider !== 'tokenmix') {
    return pickFirstPreferred()
  }

  const mid = (parsed.model ?? '').trim()
  if (mid && STRONG_MULTIMODAL_MODEL_IDS.has(mid)) return currentKey

  if (parsed.modelFamily === 'openai') {
    if (!mid || mid === 'gpt-4o-mini' || mid === 'o3-mini') {
      const k = 'tokenmix::openai::gpt-4o'
      return keySet.has(k) ? k : pickFirstPreferred()
    }
  }

  if (!mid) {
    return pickFirstPreferred()
  }

  return pickFirstPreferred()
}
