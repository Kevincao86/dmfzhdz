/** AI 混剪 / 智能成片 — 背景音乐预设（cs 静态 + IMS 公网兜底） */

export type IceMixBgmPreset = {
  id: string
  label: string
  description: string
  url: string
}

const CS_BGM_BASE = 'https://cs.mofangdianai.com'

/** 内置 10 段 BGM（cs 静态资源，已部署） */
export const ICE_MIX_BGM_PRESETS: readonly IceMixBgmPreset[] = [
  { id: 'bgm-1', label: '探店轻快 1', description: '节奏明快，适合开场', url: `${CS_BGM_BASE}/bgm-1.mp3` },
  { id: 'bgm-2', label: '美食氛围 2', description: '温暖铺底，不抢人声', url: `${CS_BGM_BASE}/bgm-2.mp3` },
  { id: 'bgm-3', label: '舒缓背景 3', description: '低干扰环境音', url: `${CS_BGM_BASE}/bgm-3.mp3` },
  { id: 'bgm-4', label: '活力带货 4', description: '促销转化向', url: `${CS_BGM_BASE}/bgm-4.mp3` },
  { id: 'bgm-5', label: '清新日常 5', description: '生活 Vlog 感', url: `${CS_BGM_BASE}/bgm-5.mp3` },
  { id: 'bgm-6', label: '质感慢铺 6', description: '强调品质感', url: `${CS_BGM_BASE}/bgm-6.mp3` },
  { id: 'bgm-7', label: '轻快节拍 7', description: '卡点切换友好', url: `${CS_BGM_BASE}/bgm-7.mp3` },
  { id: 'bgm-8', label: '温暖食光 8', description: '餐饮探店主流', url: `${CS_BGM_BASE}/bgm-8.mp3` },
  { id: 'bgm-9', label: '简约底噪 9', description: '几乎纯氛围', url: `${CS_BGM_BASE}/bgm-9.mp3` },
  { id: 'bgm-10', label: '收尾号召 10', description: '适合结尾 CTA', url: `${CS_BGM_BASE}/bgm-10.mp3` },
] as const

export const ICE_MIX_BGM_DEFAULT_ID = 'bgm-2'

export const ICE_MIX_BGM_NONE_ID = 'none'

export function resolveIceMixBgmPreset(id?: string): IceMixBgmPreset | null {
  const t = String(id ?? '').trim()
  if (!t || t === ICE_MIX_BGM_NONE_ID) return null
  return ICE_MIX_BGM_PRESETS.find((p) => p.id === t) ?? ICE_MIX_BGM_PRESETS.find((p) => p.id === ICE_MIX_BGM_DEFAULT_ID) ?? null
}

export function resolveIceMixBgmUrl(opts?: {
  presetId?: string
  customUrl?: string
}): string | undefined {
  const custom = String(opts?.customUrl ?? '').trim()
  if (custom.startsWith('http')) return custom
  return resolveIceMixBgmPreset(opts?.presetId)?.url
}
