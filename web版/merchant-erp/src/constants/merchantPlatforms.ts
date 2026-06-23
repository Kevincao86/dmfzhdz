/**
 * 商户经营平台统一注册表：团购（到店）与外卖（到家）分渠道。
 * OpenAPI 文档：
 * - 淘宝闪购 https://open.shop.ele.me/
 * - 美团外卖 https://developer.meituan.com/docs/api
 * - 京东外卖 https://opendj.jd.com/
 */

export type PlatformChannel = 'groupbuy' | 'waimai'

/** 商品创建 / 门店 Tab / 评价 / 活动等共用的平台 ID */
export type MerchantPlatformId =
  | 'douyin'
  | 'kuaishou'
  | 'meituan'
  | 'xiaohongshu'
  | 'jd'
  | 'eleme'
  | 'meituan_waimai'
  | 'jd_waimai'

export type MerchantPlatformDef = {
  id: MerchantPlatformId
  name: string
  letter: string
  color: string
  channel: PlatformChannel
  /** `/api/merchant/{segment}` 路径段 */
  apiSegment: string
  /** sessionStorage token key */
  tokenSessionKey: string
  appIdSessionKey: string
  docsUrl: string
  /** 是否已在商家版后台提供绑定 UI */
  settingsBindable: boolean
  /** 商品创建：是否展示独立向导（否则通用草稿） */
  dedicatedProductWizard: boolean
  /** 列表/探测：暂未接网关 */
  comingSoon?: boolean
}

const GROUPBUY: MerchantPlatformDef[] = [
  {
    id: 'douyin',
    name: '抖音来客',
    letter: '抖',
    color: 'from-pink-500 to-rose-500',
    channel: 'groupbuy',
    apiSegment: 'douyin',
    tokenSessionKey: 'meoo_douyin_merchant_token',
    appIdSessionKey: 'meoo_douyin_app_id',
    docsUrl: 'https://open.douyin.com/',
    settingsBindable: true,
    dedicatedProductWizard: true,
  },
  {
    id: 'kuaishou',
    name: '快手团购',
    letter: '快',
    color: 'from-orange-500 to-amber-500',
    channel: 'groupbuy',
    apiSegment: 'kuaishou',
    tokenSessionKey: 'meoo_kuaishou_merchant_token',
    appIdSessionKey: 'meoo_kuaishou_app_id',
    docsUrl: 'https://open.kwailocallife.com/',
    settingsBindable: true,
    dedicatedProductWizard: true,
  },
  {
    id: 'meituan',
    name: '美团点评',
    letter: '美',
    color: 'from-yellow-500 to-orange-500',
    channel: 'groupbuy',
    apiSegment: 'meituan',
    tokenSessionKey: 'meoo_meituan_merchant_token',
    appIdSessionKey: 'meoo_meituan_app_id',
    docsUrl: 'https://developer.meituan.com/docs/api',
    settingsBindable: false,
    dedicatedProductWizard: false,
    comingSoon: true,
  },
  {
    id: 'xiaohongshu',
    name: '小红书',
    letter: '红',
    color: 'from-red-500 to-pink-500',
    channel: 'groupbuy',
    apiSegment: 'xhs',
    tokenSessionKey: 'meoo_xhs_merchant_token',
    appIdSessionKey: 'meoo_xhs_app_id',
    docsUrl: 'https://open.xiaohongshu.com/',
    settingsBindable: true,
    dedicatedProductWizard: false,
  },
  {
    id: 'jd',
    name: '京东本地生活',
    letter: '京',
    color: 'from-red-600 to-red-500',
    channel: 'groupbuy',
    apiSegment: 'jd',
    tokenSessionKey: 'meoo_jd_merchant_token',
    appIdSessionKey: 'meoo_jd_app_id',
    docsUrl: 'https://opendj.jd.com/',
    settingsBindable: false,
    dedicatedProductWizard: false,
    comingSoon: true,
  },
]

const WAIMAI: MerchantPlatformDef[] = [
  {
    id: 'eleme',
    name: '淘宝闪购',
    letter: '闪',
    color: 'from-blue-500 to-cyan-500',
    channel: 'waimai',
    apiSegment: 'eleme',
    tokenSessionKey: 'meoo_eleme_merchant_token',
    appIdSessionKey: 'meoo_eleme_app_id',
    docsUrl:
      'https://open.shop.ele.me/base/documents/reference/fc2da5ae0d3b4e219e5dcf6e668a8087',
    settingsBindable: false,
    dedicatedProductWizard: true,
    comingSoon: true,
  },
  {
    id: 'meituan_waimai',
    name: '美团外卖',
    letter: '外',
    color: 'from-yellow-400 to-amber-500',
    channel: 'waimai',
    apiSegment: 'meituan_waimai',
    tokenSessionKey: 'meoo_meituan_waimai_merchant_token',
    appIdSessionKey: 'meoo_meituan_waimai_app_id',
    docsUrl: 'https://developer.meituan.com/docs/api',
    settingsBindable: false,
    dedicatedProductWizard: true,
    comingSoon: true,
  },
  {
    id: 'jd_waimai',
    name: '京东外卖',
    letter: '京',
    color: 'from-red-700 to-red-500',
    channel: 'waimai',
    apiSegment: 'jd_waimai',
    tokenSessionKey: 'meoo_jd_waimai_merchant_token',
    appIdSessionKey: 'meoo_jd_waimai_app_id',
    docsUrl: 'https://opendj.jd.com/staticnew/widgets/resources.html',
    settingsBindable: false,
    dedicatedProductWizard: true,
    comingSoon: true,
  },
]

export const MERCHANT_PLATFORMS: MerchantPlatformDef[] = [...GROUPBUY, ...WAIMAI]

export const GROUPBUY_PLATFORMS = GROUPBUY
export const WAIMAI_PLATFORMS = WAIMAI

export const PRODUCT_CREATE_PLATFORMS = MERCHANT_PLATFORMS.map((p) => ({
  id: p.id,
  name: p.name,
  letter: p.letter,
  color: p.color,
  channel: p.channel,
  comingSoon: p.comingSoon,
}))

export type CreatePlatformId = MerchantPlatformId

export function isCreatePlatformId(s: string): s is CreatePlatformId {
  return MERCHANT_PLATFORMS.some((p) => p.id === s)
}

export function getMerchantPlatform(id: MerchantPlatformId): MerchantPlatformDef {
  return MERCHANT_PLATFORMS.find((p) => p.id === id)!
}

export function createPlatformApiSegment(id: CreatePlatformId): string {
  return getMerchantPlatform(id).apiSegment
}

export function createPlatformLabel(id: CreatePlatformId): string {
  return getMerchantPlatform(id).name
}

export function platformChannelLabel(channel: PlatformChannel): string {
  return channel === 'groupbuy' ? '团购平台' : '外卖平台'
}

/** 财务 / 评价等 API 平台 ID（不含即将开放的 jd 团购） */
export type FinancePlatformId =
  | 'douyin'
  | 'kuaishou'
  | 'meituan'
  | 'xhs'
  | 'eleme'
  | 'meituan_waimai'
  | 'jd_waimai'

export function toFinancePlatformId(id: MerchantPlatformId): FinancePlatformId | null {
  if (id === 'xiaohongshu') return 'xhs'
  if (id === 'jd') return null
  return id as FinancePlatformId
}

export function financePlatformChannel(p: FinancePlatformId): PlatformChannel {
  if (p === 'eleme' || p === 'meituan_waimai' || p === 'jd_waimai') return 'waimai'
  return 'groupbuy'
}
