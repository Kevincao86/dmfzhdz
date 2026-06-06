import type { AIModelFamily } from './types'
import { isAgentImagePickerKey, parseAgentImagePickerKey, effectiveChatPickerKey } from './agentImageModelKeys'
import { detectImageGenerationIntent } from './aiImageIntentRouting'
import { parseAiModelPickerKey } from './modelRegistry'
import { inferTaskTypeFromText } from '../../lib/aiAgentActionParse'

/**
 * 是否应走 /api/meoo-ai-agent-image（像素出图）。
 * 用户选中生图模型时，仅在生图意图或图生图（有参考图）时出图；纯对话仍走 chat。
 */
const STRUCTURED_PRODUCT_PREVIEW_HINT =
  /预览|审核|组|套餐|代金券|单人餐|双人餐|三人餐|四人餐|五人餐|家庭餐|创建商品|上架|价目|菜单/i

export function shouldRouteToAgentNativeImage(
  pickerKey: string,
  userLine: string,
  visionUrls: string[],
): boolean {
  if (!isAgentImagePickerKey(pickerKey)) return false
  if (
    inferTaskTypeFromText(userLine) === 'create_product' &&
    !detectImageGenerationIntent(userLine)
  ) {
    return false
  }
  if (visionUrls.length > 0 && STRUCTURED_PRODUCT_PREVIEW_HINT.test(userLine)) return false
  const refImg = visionUrls[0]?.trim()
  if (refImg) return true
  return detectImageGenerationIntent(userLine)
}

function familyFromChatPickerKey(key: string): AIModelFamily | null {
  const p = parseAiModelPickerKey(key)
  return p?.provider === 'tokenmix' ? p.modelFamily : null
}

/** 按用户所选模型（含生图项对应的对话厂商）追加简短对话风格说明 */
export function dialogueStyleAddonForPickerKey(pickerKey: string): string {
  const chatKey = effectiveChatPickerKey(pickerKey)
  const img = parseAgentImagePickerKey(pickerKey)
  if (img?.kind === 'vendor') {
    if (img.vendor === 'qwen') return '使用通义千问：中文表达自然、清晰。'
    if (img.vendor === 'doubao') return '使用豆包：口语化、易读。'
    if (img.vendor === 'minimax') return '使用 MiniMax：简洁有力，适合口播与短文案。'
    return '使用灵祺内置生图引擎配套的对话风格：务实、可执行。'
  }

  const parsed = parseAiModelPickerKey(chatKey)
  if (!parsed) return ''

  if (parsed.provider === 'tokenmix') {
    const fam = familyFromChatPickerKey(chatKey)
    switch (fam) {
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
