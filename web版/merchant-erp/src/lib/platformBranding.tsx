import { cn } from '../cn'

/** 静态 Logo 资源（public/platforms） */
export type PlatformLogoKey =
  | 'douyin'
  | 'dianping'
  | 'xiaohongshu'
  | 'douyin_laike'
  | 'ocean_engine_local'
  | 'xhs_juguang'

export const PLATFORM_LOGO_SRC: Record<PlatformLogoKey, string> = {
  douyin: '/platforms/douyin.png',
  dianping: '/platforms/dianping.png',
  xiaohongshu: '/platforms/xiaohongshu.png',
  douyin_laike: '/platforms/douyin-laike.png',
  ocean_engine_local: '/platforms/ocean-engine-local.png',
  xhs_juguang: '/platforms/xhs-juguang.png',
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
export type MerchantBackendPlatformId = 'douyin' | 'meituan' | 'xhs'

export type MerchantBackendPlatformBrand = {
  id: MerchantBackendPlatformId
  tabName: string
  logo: PlatformLogoKey
}

export const MERCHANT_BACKEND_PLATFORMS: MerchantBackendPlatformBrand[] = [
  { id: 'douyin', tabName: '抖音来客', logo: 'douyin_laike' },
  { id: 'meituan', tabName: '大众点评商家版', logo: 'dianping' },
  { id: 'xhs', tabName: '小红书商家版', logo: 'xiaohongshu' },
]

/** 外卖平台（商家版后台第二组 Tab，与团购并列） */
export type WaimaiBackendPlatformId = 'eleme' | 'meituan_waimai' | 'jd_waimai'

export type WaimaiBackendPlatformBrand = {
  id: WaimaiBackendPlatformId
  tabName: string
  letter: string
}

export const WAIMAI_BACKEND_PLATFORMS: WaimaiBackendPlatformBrand[] = [
  { id: 'eleme', tabName: '淘宝闪购', letter: '闪' },
  { id: 'meituan_waimai', tabName: '美团外卖', letter: '外' },
  { id: 'jd_waimai', tabName: '京东外卖', letter: '京' },
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
  return (
    <img
      src={PLATFORM_LOGO_SRC[logo]}
      alt={alt ?? ''}
      className={cn('shrink-0 rounded-xl object-cover shadow-sm', box, className)}
    />
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
