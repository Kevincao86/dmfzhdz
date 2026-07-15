/** 平台装修 · 活动海报弹窗 / 页面广告位 */

export type PlatformDecorSurface = 'mp' | 'dr' | 'cs'

export type PlatformDecorLinkType = 'mp_path' | 'web_url' | 'none'

export type PlatformDecorFreq = 'once' | 'daily' | 'always'

export type PlatformDecorIdentity = 'all' | 'pr' | 'talent' | 'shoot' | 'edit'

/** 计划内 P0/P1 槽位 */
export const PLATFORM_DECOR_SLOT_KEYS = [
  'mp.home.popup',
  'mp.home.banner',
  'mp.mine.entry',
  'mp.hall.strip',
  'dr.home.popup',
  'dr.profile.banner',
  'dr.hall.banner',
  'dr.login.side',
  'cs.home.popup',
  'cs.home.banner',
  'cs.settings.affiliate',
  'cs.login.banner',
] as const

export type PlatformDecorSlotKey = (typeof PLATFORM_DECOR_SLOT_KEYS)[number]

export const PLATFORM_DECOR_SLOT_LABELS: Record<string, string> = {
  'mp.home.popup': '小程序 · 首页弹窗',
  'mp.home.banner': '小程序 · 首页 Banner',
  'mp.mine.entry': '小程序 · 我的推广上方',
  'mp.hall.strip': '小程序 · 大厅顶细条',
  'dr.home.popup': '星选 DR · 首页弹窗',
  'dr.profile.banner': '星选 DR · 我的页 Banner',
  'dr.hall.banner': '星选 DR · 大厅 Banner',
  'dr.login.side': '星选 DR · 登录页',
  'cs.home.popup': '商家 ERP · 工作台弹窗',
  'cs.home.banner': '商家 ERP · 工作台 Banner',
  'cs.settings.affiliate': '商家 ERP · 我的推广顶',
  'cs.login.banner': '商家 ERP · 登录/注册页',
}

export type RegistryPlatformDecorItem = {
  id: string
  /** 弹窗用 slotKey 含 .popup；Banner/条幅用其它 slotKey */
  slotKey: string
  enabled: boolean
  title: string
  imageUrl: string
  linkType: PlatformDecorLinkType
  linkValue?: string
  /** 仅弹窗：身份过滤 */
  identities?: PlatformDecorIdentity[]
  startAt?: string
  endAt?: string
  /** 仅弹窗频控 */
  freq?: PlatformDecorFreq
  priority: number
  updatedAt?: string
}

export type RegistryPlatformDecoration = {
  items: RegistryPlatformDecorItem[]
  updatedAt?: string
}

export type PlatformDecorPublicPayload = {
  ok: true
  item: RegistryPlatformDecorItem | null
  items?: RegistryPlatformDecorItem[]
}
