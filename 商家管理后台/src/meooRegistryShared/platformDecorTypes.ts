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

/**
 * 各槽位建议像素（宽×高）。按 @2x / 常见手机宽约 750 设计；视频同画幅即可。
 */
export const PLATFORM_DECOR_SLOT_SIZE_HINTS: Record<string, string> = {
  'mp.home.popup': '建议 750×1000（竖版 3:4，居中弹窗）',
  'mp.home.banner': '建议 750×320（横版 Banner，约 21:9）',
  'mp.mine.entry': '建议 750×180（横条）',
  'mp.hall.strip': '建议 750×96（细条）',
  'dr.home.popup': '建议 720×960（竖版 3:4）',
  'dr.profile.banner': '建议 1200×360（横版，约 10:3）',
  'dr.hall.banner': '建议 1200×360（横版）',
  'dr.login.side': '建议 480×640（竖版，侧栏/底部）',
  'cs.home.popup': '建议 720×900（竖版，工作台弹窗）',
  'cs.home.banner': '建议 1440×320（宽屏横 Banner）',
  'cs.settings.affiliate': '建议 1200×280（横条）',
  'cs.login.banner': '建议 1440×400（登录页横 Banner）',
}

export type PlatformDecorMediaType = 'image' | 'video'

export type RegistryPlatformDecorItem = {
  id: string
  /** 弹窗用 slotKey 含 .popup；Banner/条幅用其它 slotKey */
  slotKey: string
  enabled: boolean
  title: string
  /** 海报素材 URL（静图 / GIF / 视频均可） */
  imageUrl: string
  /** 缺省时按 URL 后缀推断；GIF 仍按 image 展示 */
  mediaType?: PlatformDecorMediaType
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

/** 是否按视频播放（GIF 走图片） */
export function isDecorVideoMedia(item: {
  mediaType?: string | null
  imageUrl?: string | null
}): boolean {
  if (String(item.mediaType || '').toLowerCase() === 'video') return true
  if (String(item.mediaType || '').toLowerCase() === 'image') return false
  const u = String(item.imageUrl || '')
    .trim()
    .toLowerCase()
    .split(/[?#]/)[0]
  return /\.(mp4|webm|mov|m4v)$/.test(u)
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
