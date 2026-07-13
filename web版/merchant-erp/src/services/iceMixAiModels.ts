/** 混剪专用 AI 模型（视觉理解 / 叙事规划 / 口播检核） */
export const ICE_MIX_VISION_MODEL_QWEN = 'qwen3-vl-plus'
export const ICE_MIX_VISION_MODEL_DOUBAO = 'doubao-seed-1-6-vision-250815'
export const ICE_MIX_TEXT_MODEL_QWEN = 'qwen-max-latest'
export const ICE_MIX_TEXT_MODEL_DOUBAO = 'doubao-seed-1-6-250615'

export type IceMixAiProvider = 'qwen' | 'doubao' | 'tokenmix'

/** 视觉任务：优先通义 qwen3-vl-plus，回退豆包 seed vision */
export const ICE_MIX_VISION_PROVIDER_ORDER: Array<{ provider: IceMixAiProvider; model?: string }> = [
  { provider: 'qwen', model: ICE_MIX_VISION_MODEL_QWEN },
  { provider: 'doubao', model: ICE_MIX_VISION_MODEL_DOUBAO },
]

/** 文本规划/检核：优先 qwen-max，回退豆包 seed */
export const ICE_MIX_TEXT_PROVIDER_ORDER: Array<{ provider: IceMixAiProvider; model?: string }> = [
  { provider: 'qwen', model: ICE_MIX_TEXT_MODEL_QWEN },
  { provider: 'doubao', model: ICE_MIX_TEXT_MODEL_DOUBAO },
  { provider: 'tokenmix', model: 'gpt-4o' },
]
