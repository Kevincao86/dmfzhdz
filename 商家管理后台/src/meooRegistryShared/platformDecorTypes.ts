/** 平台装修 · 活动海报弹窗 / 页面广告位 */

export type PlatformDecorSurface = 'mp' | 'dr' | 'cs'

export type PlatformDecorLinkType = 'mp_path' | 'web_url' | 'marketing' | 'none'

export type PlatformDecorFreq = 'once' | 'daily' | 'always'

export type PlatformDecorIdentity = 'all' | 'pr' | 'talent' | 'shoot' | 'edit'

/** 计划内 P0/P1 槽位 */
export const PLATFORM_DECOR_SLOT_KEYS = [
  'mp.home.popup',
  'mp.launch.splash',
  'erp.launch.splash',
  'mp.home.banner',
  'erp.mp.home.banner',
  'mp.share.card',
  'erp.mp.share.card',
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

/** 达人小程序首页海报轮播：最多 5 张，共用一个轮播秒数 */
export const MP_HOME_BANNER_SLOT = 'mp.home.banner'
export const ERP_MP_HOME_BANNER_SLOT = 'erp.mp.home.banner'
export const MP_SHARE_CARD_SLOT = 'mp.share.card'
export const ERP_MP_SHARE_CARD_SLOT = 'erp.mp.share.card'
export const MP_HOME_BANNER_MAX = 5

export function isShareCardSlot(slotKey: string): boolean {
  return slotKey === MP_SHARE_CARD_SLOT || slotKey === ERP_MP_SHARE_CARD_SLOT
}

export function isCarouselBannerSlot(slotKey: string): boolean {
  return slotKey === MP_HOME_BANNER_SLOT || slotKey === ERP_MP_HOME_BANNER_SLOT
}

export function normalizeCarouselSeconds(raw: unknown): number {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return 4
  return Math.min(30, Math.max(2, n))
}

export const PLATFORM_DECOR_SLOT_LABELS: Record<string, string> = {
  'mp.home.popup': '小程序 · 首页弹窗',
  'mp.launch.splash': '达人小程序 · 开屏海报',
  'erp.launch.splash': '商家小程序 · 开屏海报',
  'mp.home.banner': '达人小程序 · 首页海报轮播',
  'erp.mp.home.banner': '商家小程序 · 首页海报轮播',
  'mp.share.card': '达人小程序 · 分享卡片',
  'erp.mp.share.card': '商家小程序 · 分享卡片',
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
  'mp.launch.splash': '建议 750×1334（竖版 9:16，打开达人小程序时全屏）',
  'erp.launch.splash': '建议 750×1334（竖版 9:16，打开商家小程序时全屏）',
  'mp.home.banner': '建议 750×420（最多 5 张，按优先级轮播，每张单独跳转，轮播秒数可设）',
  'erp.mp.home.banner': '建议 750×420（商家小程序首页，最多 5 张，按优先级轮播，每张单独跳转，轮播秒数可设）',
  'mp.share.card': '建议 500×400（5:4）。海报是转发卡片图，标题栏填写分享副标题。多条时用优先级最小且已启用的一条。',
  'erp.mp.share.card': '建议 500×400（5:4）。海报是转发卡片图，标题栏填写分享副标题。多条时用优先级最小且已启用的一条。',
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
  /** 仅开屏海报：播放秒数，到时关闭，期间可跳过 */
  playSeconds?: 3 | 5
  /** 仅首页海报轮播：每张停留秒数，整组共用 */
  carouselSeconds?: number
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

export function isLaunchSplashSlot(slotKey: string): boolean {
  return slotKey === 'mp.launch.splash' || slotKey === 'erp.launch.splash'
}

export function normalizePlaySeconds(raw: unknown): 3 | 5 {
  return Number(raw) === 5 ? 5 : 3
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
