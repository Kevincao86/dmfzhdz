import { cn } from '../cn'
import type { MerchantPlatformId } from '../constants/merchantPlatforms'
import { merchantStaticUrl } from './webStaticOssAssets'

/** 静态 Logo 资源（public/platforms） */
export type PlatformLogoKey =
  | 'douyin'
  | 'dianping'
  | 'xiaohongshu'
  | 'douyin_laike'
  | 'kuaishou_local'
  | 'ocean_engine_local'
  | 'xhs_juguang'
  | 'eleme_shangou'
  | 'meituan_waimai'
  | 'jd_waimai'

export const PLATFORM_LOGO_SRC: Record<PlatformLogoKey, string> = {
  douyin: merchantStaticUrl('/platforms/douyin.png'),
  dianping: merchantStaticUrl('/platforms/dianping.png'),
  xiaohongshu: merchantStaticUrl('/platforms/xiaohongshu.png'),
  douyin_laike: merchantStaticUrl('/platforms/douyin-laike.png'),
  kuaishou_local: merchantStaticUrl('/platforms/kuaishou-local.png'),
  ocean_engine_local: merchantStaticUrl('/platforms/ocean-engine-local.png'),
  xhs_juguang: merchantStaticUrl('/platforms/xhs-juguang.png'),
  eleme_shangou: merchantStaticUrl('/platforms/eleme-shangou.png'),
  meituan_waimai: merchantStaticUrl('/platforms/meituan-waimai.png'),
  jd_waimai: merchantStaticUrl('/platforms/jd-waimai.png'),
}

/** 创建商品 / 系统设置商家后台 — 各经营平台 Logo（无图时回退字母占位） */
export const MERCHANT_PLATFORM_LOGO: Partial<Record<MerchantPlatformId, PlatformLogoKey>> = {
  douyin: 'douyin_laike',
  kuaishou: 'kuaishou_local',
  meituan: 'dianping',
  xiaohongshu: 'xiaohongshu',
  eleme: 'eleme_shangou',
  meituan_waimai: 'meituan_waimai',
  jd_waimai: 'jd_waimai',
}

export function merchantPlatformLogoKey(id: MerchantPlatformId): PlatformLogoKey | null {
  return MERCHANT_PLATFORM_LOGO[id] ?? null
}

/** 平台连接（用户侧社交账号） */
export type SocialPlatformId = 'douyin' | 'dianping' | 'xhs' | 'jd'

export type SocialPlatformBrand = {
  id: SocialPlatformId
  shortName: string
  logo: PlatformLogoKey | null
  ring: string
}

export const SOCIAL_PLATFORM_BRANDS: SocialPlatformBrand[] = [
  { id: 'douyin', shortName: '抖音', logo: 'douyin', ring: 'ring-slate-300' },
  { id: 'dianping', shortName: '大众点评', logo: 'dianping', ring: 'ring-amber-200' },
  { id: 'xhs', shortName: '小红书', logo: 'xiaohongshu', ring: 'ring-rose-200' },
  { id: 'jd', shortName: '京东', logo: null, ring: 'ring-red-200' },
]

/** 商家版后台 Tab */
export type MerchantBackendPlatformId = 'douyin' | 'kuaishou' | 'meituan' | 'xhs'

export type MerchantBackendPlatformBrand = {
  id: MerchantBackendPlatformId
  tabName: string
  logo: PlatformLogoKey
  /** 商家版后台绑定 UI 暂未开放 */
  comingSoon?: boolean
}

export const MERCHANT_BACKEND_PLATFORMS: MerchantBackendPlatformBrand[] = [
  { id: 'douyin', tabName: '抖音来客', logo: 'douyin_laike' },
  { id: 'kuaishou', tabName: '快手团购', logo: 'kuaishou_local' },
  { id: 'meituan', tabName: '大众点评商家版', logo: 'dianping', comingSoon: true },
  { id: 'xhs', tabName: '小红书商家版', logo: 'xiaohongshu' },
]

/** 外卖平台（商家版后台第二组 Tab，与团购并列） */
export type WaimaiBackendPlatformId = 'eleme' | 'meituan_waimai' | 'jd_waimai'

export type WaimaiBackendPlatformBrand = {
  id: WaimaiBackendPlatformId
  tabName: string
  logo: PlatformLogoKey
  comingSoon?: boolean
}

export const WAIMAI_BACKEND_PLATFORMS: WaimaiBackendPlatformBrand[] = [
  { id: 'eleme', tabName: '淘宝闪购', logo: 'eleme_shangou', comingSoon: true },
  { id: 'meituan_waimai', tabName: '美团外卖', logo: 'meituan_waimai', comingSoon: true },
  { id: 'jd_waimai', tabName: '京东外卖', logo: 'jd_waimai', comingSoon: true },
]

export function PlatformBrandLogo({
  logo,
  alt,
  className,
  size = 'md',
}: {
  logo: PlatformLogoKey
  alt?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const box =
    size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-14 w-14' : 'h-11 w-11'
  const fitClass =
    logo === 'kuaishou_local' ? 'object-contain bg-white p-0.5' : 'object-cover'
  return (
    <img
      src={PLATFORM_LOGO_SRC[logo]}
      alt={alt ?? ''}
      className={cn('shrink-0 rounded-xl shadow-sm', box, fitClass, className)}
    />
  )
}

/** 创建商品 / 列表 — 与系统设置商家后台共用 Logo */
export function MerchantPlatformIcon({
  platformId,
  name,
  letter,
  color,
  className,
  size = 'md',
}: {
  platformId: MerchantPlatformId | string
  name?: string
  letter?: string
  /** 无 Logo 时渐变占位（来自 merchantPlatforms.color） */
  color?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const logo = MERCHANT_PLATFORM_LOGO[platformId as MerchantPlatformId]
  if (logo) {
    return (
      <PlatformBrandLogo
        logo={logo}
        alt={name ?? platformId}
        size={size}
        className={className}
      />
    )
  }
  const fallback = (letter ?? platformId.slice(0, 1)).slice(0, 1)
  const box =
    size === 'sm' ? 'h-9 w-9 text-xs' : size === 'lg' ? 'h-14 w-14 text-base' : 'h-10 w-10 text-sm'
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-r font-bold text-white shadow-sm',
        color ?? 'from-slate-500 to-slate-600',
        box,
        className,
      )}
      aria-hidden
    >
      {fallback}
    </div>
  )
}

/** 京东等暂无素材时的占位 */
export function PlatformLogoPlaceholder({
  label,
  className,
  size = 'md',
}: {
  label: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const box =
    size === 'sm' ? 'h-9 w-9 text-xs' : size === 'lg' ? 'h-14 w-14 text-base' : 'h-11 w-11 text-sm'
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-700 to-red-500 font-bold text-white shadow-sm',
        box,
        className,
      )}
      aria-hidden
    >
      {label}
    </div>
  )
}
