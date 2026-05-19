import { cn } from '../cn'

export type MerchantPlatformBrandId = 'douyin' | 'meituan' | 'xhs' | 'jd'

export type MerchantPlatformBrand = {
  id: MerchantPlatformBrandId
  /** 平台连接页展示名 */
  shortName: string
  /** 商家版后台等完整名 */
  merchantName: string
  gradient: string
  ring: string
}

export const MERCHANT_PLATFORM_BRANDS: MerchantPlatformBrand[] = [
  {
    id: 'douyin',
    shortName: '抖音',
    merchantName: '抖音商家版',
    gradient: 'from-black to-black',
    ring: 'ring-slate-300',
  },
  {
    id: 'meituan',
    shortName: '大众点评',
    merchantName: '大众点评商家版',
    gradient: 'from-amber-500 to-yellow-400',
    ring: 'ring-amber-200',
  },
  {
    id: 'xhs',
    shortName: '小红书',
    merchantName: '小红书商家版',
    gradient: 'from-red-600 to-rose-500',
    ring: 'ring-rose-200',
  },
  {
    id: 'jd',
    shortName: '京东',
    merchantName: '京东本地生活',
    gradient: 'from-red-700 to-red-500',
    ring: 'ring-red-200',
  },
]

export function getMerchantPlatformBrand(id: string): MerchantPlatformBrand | undefined {
  return MERCHANT_PLATFORM_BRANDS.find((p) => p.id === id)
}

/** 抖音 App 双色音符（非 TikTok / 来客「T」形图标） */
function DouyinAppLogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path
        fill="#25F4EE"
        d="M19.82 7.04c3.28 2.62 8.02 3.25 12.04 1.6v6.7c-2.87-.38-5.84.35-8.18 2.02-2.74 1.99-4.4 5.22-4.4 8.8v14.62h-6.7V21.16c0-8.66 2.95-12.54 7.24-15.8v2.68z"
      />
      <path
        fill="#FE2C55"
        d="M31.86 8.64v6.7c2.87.38 5.84 1.34 8.18 3.01 2.74 1.99 4.4 5.22 4.4 8.8v14.62h6.7V29.76c0-8.66-2.95-12.54-7.24-15.8-3.28-2.62-8.02-3.25-12.04-1.6z"
      />
    </svg>
  )
}

/** 平台 Logo（简化品牌色块 + 标识，避免依赖外链图床） */
export function PlatformBrandLogo({
  id,
  className,
  size = 'md',
}: {
  id: MerchantPlatformBrandId
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const brand = getMerchantPlatformBrand(id)
  const box =
    size === 'sm' ? 'h-9 w-9 text-sm' : size === 'lg' ? 'h-14 w-14 text-xl' : 'h-11 w-11 text-base'
  const label =
    id === 'douyin' ? (
      <DouyinAppLogoMark className="h-[62%] w-[62%]" />
    ) : id === 'meituan' ? (
      <span className="text-xs font-bold leading-none text-gray-900">点评</span>
    ) : id === 'xhs' ? (
      <span className="text-lg font-bold leading-none text-white">书</span>
    ) : (
      <span className="text-sm font-bold leading-none text-white">JD</span>
    )

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm',
        brand?.gradient ?? 'from-slate-400 to-slate-500',
        box,
        className,
      )}
      title={brand?.shortName}
    >
      {label}
    </div>
  )
}
