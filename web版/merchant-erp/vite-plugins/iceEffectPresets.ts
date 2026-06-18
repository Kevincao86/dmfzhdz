/**
 * ICE 云剪辑 — 商户可选特效预设（与 aliyunIceGateway / iceBriefTimelinePlan 联动）
 */

export type IceEffectPreset = {
  id: string
  label: string
}

export const ICE_EFFECT_PRESETS: readonly IceEffectPreset[] = [
  { id: 'none', label: '无附加特效' },
  { id: 'fade', label: '淡入淡出' },
] as const

export function resolveIceEffectPreset(idOrLabel: string): IceEffectPreset {
  const key = String(idOrLabel || '').trim()
  return (
    ICE_EFFECT_PRESETS.find((p) => p.id === key || p.label === key) ?? ICE_EFFECT_PRESETS[0]!
  )
}
