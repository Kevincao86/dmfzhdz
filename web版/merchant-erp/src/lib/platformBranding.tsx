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
    gradient: 'from-gray-900 via-gray-800 to-pink-600',
    ring: 'ring-pink-200',
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
      <svg viewBox="0 0 24 24" className="h-[55%] w-[55%] fill-white" aria-hidden>
        <path d="M16.6 5.82s-.51.72-2.04 1.28c-1.44.51-3.45.64-3.45.64s2.17 9.92 2.58 11.74c.38 1.66 1.15 2.3 2.3 2.3 1.02 0 2.04-.64 2.04-.64l-.51 3.07s-1.92 1.02-3.58 1.02c-2.43 0-3.32-1.47-4.22-3.32-.96-1.98-2.04-4.22-2.04-4.22l-1.6-7.87h-3.9V5.82h16.6z" />
      </svg>
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
