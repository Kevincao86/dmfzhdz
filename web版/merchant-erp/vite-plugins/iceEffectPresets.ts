/**
 * 阿里云 ICE 云剪 — 画面特效 / 转场预设（DLTransition 不缩短成片总时长）。
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
  { id: 'fade', label: '淡入淡出', fadeClip: true },
  { id: 'trans_fade', label: '叠化转场', transitionSubType: 'fade' },
  { id: 'trans_wipe', label: '向右擦除', transitionSubType: 'wiperight' },
  { id: 'trans_wipe_up', label: '向上擦除', transitionSubType: 'wipeup' },
  { id: 'trans_zoom', label: '放大切换', transitionSubType: 'simplezoom' },
  { id: 'trans_perlin', label: '蔓延溶解', transitionSubType: 'perlin' },
  { id: 'trans_directional', label: '方向推移', transitionSubType: 'directional' },
  { id: 'trans_random', label: '随机转场', transitionSubType: 'random' },
  { id: 'fade_trans_fade', label: '淡入淡出+叠化', fadeClip: true, transitionSubType: 'fade' },
] as const

export function resolveIceEffectPreset(idOrLabel: string): IceEffectPreset {
  const key = String(idOrLabel || '').trim()
  const hit = ICE_EFFECT_PRESETS.find((p) => p.id === key)
  if (hit) return hit
  const byLabel = ICE_EFFECT_PRESETS.find((p) => p.label === key)
  return byLabel ?? ICE_EFFECT_PRESETS[0]!
}
