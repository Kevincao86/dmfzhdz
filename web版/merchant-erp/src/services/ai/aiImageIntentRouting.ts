import { resolveImagePickerKeyForUserLine } from './agentImageModelKeys.js'
import type { AiModelPickerOption } from './modelRegistry'

/** 文案/话术类「生成」不应走像素出图 */
const COPYWRITING_HINT =
  /话术|文案|脚本|口播|推广语|广告语|slogan|标题|描述|方案|计划|报告|清单|列表|邮件|短信|推文|种草|攻略|字幕|旁白|台词|宣传语|种草文案/i

/** 用户是否在描述「要生成/设计画面」类需求（非仅含「图片」二字） */
export function detectImageGenerationIntent(text: string): boolean {
  const t = text.trim()
  if (t.length < 2) return false
  if (COPYWRITING_HINT.test(t)) return false
  if (/生图|文生图|图生图|作图|出图|AI绘画|帮我画|画一张|画一幅|画个|P图|抠图|换背景/i.test(t)) return true
  if (/帮我生成|生成一张|生成一幅|生成个/i.test(t)) {
    return /图|照|海报|封面|logo|插画|门头|配图|画面|像素|宣传图|店招/i.test(t)
  }
  if (/生成.{0,24}(图|照片|图片|照|海报|门头|封面|插画|效果图|宣传图|店招|logo)/i.test(t)) return true
  if (/(?:设计|做|来).{0,10}(?:图|海报|门头|封面|店招|logo)/i.test(t)) return true
  if (/门头照|店招|宣传海报|封面图|配图|效果图|插画|海报设计|logo设计|文生|图生/i.test(t)) return true
  return false
}

/** 发送前：对话模型 + 生图意图 → 自动切换为文生图 picker */
export function resolveModelPickerKeyForImageIntent(
  currentKey: string,
  options: readonly AiModelPickerOption[],
  userLine: string,
  hasComposerImages: boolean,
): string {
  return resolveImagePickerKeyForUserLine(currentKey, options, userLine, hasComposerImages)
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
