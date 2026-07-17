/**
 * 阿里云 ICE 云剪 — 画面特效 / 转场预设（浏览器 + 服务端共用，勿放 vite-plugins）。
 * @see https://help.aliyun.com/zh/ims/developer-reference/normal-transition-effect-example
 */

export type IceEffectPreset = {
  id: string
  label: string
  /** 单张素材片头片尾 Fade */
  fadeClip?: boolean
  /** 多图之间的 DLTransition SubType */
  transitionSubType?: string
}

/** 与运营台 / GET ice/config 的 effectOptions 同步 */
export const ICE_EFFECT_PRESETS: readonly IceEffectPreset[] = [
  { id: 'none', label: '无附加特效' },
  /** 按素材内容自动挑选转场（服务端映射为随机/智能转场策略） */
  { id: 'smart', label: '智能（按内容自动转场）', transitionSubType: 'random' },
  { id: 'fade', label: '淡入淡出', fadeClip: true },
  { id: 'trans_fade', label: '叠化转场', transitionSubType: 'fade' },
  { id: 'trans_wipe', label: '向右擦除', transitionSubType: 'wiperight' },
  { id: 'trans_wipe_left', label: '向左擦除', transitionSubType: 'wipeleft' },
  { id: 'trans_wipe_up', label: '向上擦除', transitionSubType: 'wipeup' },
  { id: 'trans_wipe_down', label: '向下擦除', transitionSubType: 'wipedown' },
  { id: 'trans_zoom', label: '放大切换', transitionSubType: 'simplezoom' },
  { id: 'trans_perlin', label: '蔓延溶解', transitionSubType: 'perlin' },
  { id: 'trans_directional', label: '方向推移', transitionSubType: 'directional' },
  { id: 'trans_swirl', label: '中心旋转', transitionSubType: 'swirl' },
  { id: 'trans_doorway', label: '开幕转场', transitionSubType: 'doorway' },
  { id: 'trans_ripple', label: '波纹转场', transitionSubType: 'ripple' },
  { id: 'trans_burn', label: '燃烧转场', transitionSubType: 'burn' },
  { id: 'trans_glitch', label: '故障转场', transitionSubType: 'glitchmemories' },
  { id: 'trans_pixelize', label: '像素溶解', transitionSubType: 'pixelize' },
  { id: 'trans_bounce_up', label: '向上弹动', transitionSubType: 'bounce_up' },
  { id: 'trans_dreamy', label: '轻微摇摆', transitionSubType: 'dreamy' },
  { id: 'trans_heart', label: '爱心遮罩', transitionSubType: 'heart' },
  { id: 'trans_kaleidoscope', label: '万花筒', transitionSubType: 'kaleidoscope' },
  { id: 'trans_random', label: '随机转场', transitionSubType: 'random' },
  { id: 'fade_trans_fade', label: '淡入淡出+叠化', fadeClip: true, transitionSubType: 'fade' },
] as const

/** AI 混剪面板：仅含转场的选项（排除 none / 纯淡入淡出） */
export const ICE_MIX_TRANSITION_PRESETS: readonly IceEffectPreset[] = ICE_EFFECT_PRESETS.filter(
  (p) => Boolean(p.transitionSubType),
)

export function resolveIceEffectPreset(idOrLabel: string): IceEffectPreset {
  const key = String(idOrLabel || '').trim()
  const hit = ICE_EFFECT_PRESETS.find((p) => p.id === key)
  if (hit) return hit
  const byLabel = ICE_EFFECT_PRESETS.find((p) => p.label === key)
  return byLabel ?? ICE_EFFECT_PRESETS[0]!
}
