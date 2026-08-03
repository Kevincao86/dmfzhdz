import { resolveImagePickerKeyForUserLine } from './agentImageModelKeys.js'
import { vendorTierAutoPickerKey } from '../../lib/vendorModelPool.js'
import type { AiModelPickerOption } from './modelRegistry'
import {
  MP_POINTS_VISUAL_STUDIO_IMAGE_PER_USE,
  MP_POINTS_VISUAL_STUDIO_IMAGE_PRO_PER_USE,
} from '../../lib/mpPointsEconomics'

/** 文案/话术类「生成」不应走像素出图 */
const COPYWRITING_HINT =
  /话术|文案|脚本|口播|推广语|广告语|slogan|标题|描述|方案|计划|报告|清单|列表|邮件|短信|推文|种草|攻略|字幕|旁白|台词|宣传语|种草文案/i

/** 短视频混剪 / 剪辑（有素材时须走对话或混剪页，禁止误入文生图/图生图） */
export function detectIceMixVideoIntent(text: string): boolean {
  const t = text.trim()
  if (t.length < 2) return false
  return /混剪|AI\s*剪辑|智能剪辑|一键成片|视频拼接|素材剪辑|帮我剪(?:辑|一下|一剪)|剪成片|多素材.*(?:剪|拼)|(?:剪|拼).*(?:视频|成片)/i.test(
    t,
  )
}

/** 明确改图 / 图上改字（含附图场景） */
function detectImageEditIntent(text: string, hasImages: boolean): boolean {
  const t = text.trim()
  if (/改图|修图|图生图|换背景|抠图|P图|P一下|把文字换|改文字|替换文字|图上的字|图片文字|图里的字|海报文字/i.test(t)) {
    return true
  }
  if (!hasImages) return false
  // 附图 +「把文字换成… / 改成…」等（图3：帮我把文字换成超猛炒鸡）
  if (/(?:换|改|替换).{0,16}(?:字|文字|文案|标题|logo|Logo|内容)|(?:字|文字|文案|标题).{0,10}(?:换|改)成/i.test(t)) {
    return true
  }
  if (/(?:把|将).{0,12}(?:这张|该|原)?图.{0,16}(?:改|换|修|替换)|基于这张图|根据这张图|按这张图|修改图片|改图片/i.test(t)) {
    return true
  }
  return false
}

/** 用户是否在描述「要生成/设计画面」类需求（非仅含「图片」二字） */
export function detectImageGenerationIntent(text: string, hasImages = false): boolean {
  const t = text.trim()
  if (t.length < 2) return false
  if (detectIceMixVideoIntent(t)) return false
  if (COPYWRITING_HINT.test(t) && !detectImageEditIntent(t, hasImages)) return false
  if (detectImageEditIntent(t, hasImages)) return true
  if (/生图|文生图|图生图|作图|出图|AI绘画|帮我画|画一张|画一幅|画个|P图|抠图|换背景/i.test(t)) return true
  if (/帮我生成|生成一张|生成一幅|生成个/i.test(t)) {
    return /图|照|海报|封面|logo|插画|门头|配图|画面|像素|宣传图|店招/i.test(t)
  }
  if (/生成.{0,24}(图|照片|图片|照|海报|门头|封面|插画|效果图|宣传图|店招|logo)/i.test(t)) return true
  if (/(?:设计|做|来).{0,10}(?:图|海报|门头|封面|店招|logo)/i.test(t)) return true
  if (/主图|商品图|详情图|banner|Banner/i.test(t)) return true
  if (/门头照|店招|宣传海报|封面图|配图|效果图|插画|海报设计|logo设计|文生|图生/i.test(t)) return true
  return false
}

/**
 * 用户对国内出图不满意，要求高级（国外）模型重绘。
 * 匹配后应走 TokenMix GPT Image，且不传参考图。
 */
export function detectPremiumImageRetryIntent(text: string): boolean {
  const t = text.trim()
  if (t.length < 2) return false
  if (detectIceMixVideoIntent(t)) return false
  return (
    /用高级(?:模型)?(?:重绘|再画|再生成|生成|出图)?|高级(?:生图|模型)(?:重绘|再画|再生成)?|国外(?:模型|生图)|GPT\s*Image|绘境\s*Max|换国外|换高级|重新用高级/i.test(
      t,
    ) ||
    /(?:效果|图片|出图|生图).{0,10}不满意|不满意.{0,16}(?:重绘|再生成|换模型|用高级|高级模型)/i.test(t)
  )
}

/** 高级生图固定 picker（GPT Image 2） */
export const AGENT_PREMIUM_IMAGE_PICKER_KEY = 'img::m::openai::gpt-image-2'

/** 国内出图成功后的高级模型引导文案 */
export function agentDomesticImageUpsellTip(): string {
  return `若对效果不满意，可回复「用高级模型重绘」（国外 GPT Image，约 ${MP_POINTS_VISUAL_STUDIO_IMAGE_PRO_PER_USE} 积分/张；常规国内约 ${MP_POINTS_VISUAL_STUDIO_IMAGE_PER_USE} 积分/张）。带参考图的高级重绘将按文字描述重新生成，不再贴原图。`
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
      ? vendorTierAutoPickerKey('qwen', 'image_text')
      : vendorUsed === 'doubao'
        ? vendorTierAutoPickerKey('doubao', 'image_text')
        : 'minimax::__default__'
  return options.some((o) => o.key === k) ? k : null
}
