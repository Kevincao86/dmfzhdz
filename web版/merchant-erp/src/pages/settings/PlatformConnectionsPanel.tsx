import { ChevronRight, Plus } from 'lucide-react'
import { useMemo } from 'react'
import { cn } from '../../cn'
import {
  MERCHANT_PLATFORM_BRANDS,
  PlatformBrandLogo,
  type MerchantPlatformBrandId,
} from '../../lib/platformBranding'
import { readMerchantSession } from '../../lib/merchantSession'

const TOKEN_BY_PLATFORM: Record<MerchantPlatformBrandId, string | null> = {
  douyin: 'meoo_douyin_merchant_token',
  meituan: 'meoo_meituan_merchant_token',
  xhs: 'meoo_xhs_merchant_token',
  jd: null,
}

const MAX_ACCOUNTS = 3

type Props = {
  onManage: (id: MerchantPlatformBrandId) => void
}

export default function PlatformConnectionsPanel({ onManage }: Props) {
  const connected = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const p of MERCHANT_PLATFORM_BRANDS) {
      const key = TOKEN_BY_PLATFORM[p.id]
      map[p.id] = Boolean(key && readMerchantSession(key)?.trim())
    }
    return map
  }, [])

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white px-4 py-4 sm:px-5">
        <h3 className="text-lg font-semibold text-slate-900">平台账号绑定</h3>
        <p className="mt-1 text-sm text-slate-600">
          连接各本地生活平台商家账号，用于商品、门店、评价、财务对账等能力。每个平台最多绑定 {MAX_ACCOUNTS}{' '}
          个账号；详细授权请在「商家版后台」完成。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {MERCHANT_PLATFORM_BRANDS.map((p) => {
          const isJd = p.id === 'jd'
          const isOn = connected[p.id]
          return (
            <div
              key={p.id}
              className={cn(
                'group relative overflow-hidden rounded-2xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md',
                isOn ? `border-transparent ring-2 ${p.ring}` : 'border-slate-200',
              )}
            >
              {isOn ? (
                <div
                  className={cn('pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r', p.gradient)}
                  aria-hidden
                />
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <PlatformBrandLogo id={p.id} size="md" />
                  <div className="min-w-0">
                    <h4 className="font-semibold text-slate-900">{p.shortName}</h4>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {isOn ? '已连接 · 1 个账号' : '未连接'}
                      {!isJd ? ` · 最多 ${MAX_ACCOUNTS} 个` : ''}
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
                    isOn ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {isOn ? '已连接' : isJd ? '即将开放' : '未连接'}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {isJd ? (
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-400"
                  >
                    敬请期待
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onManage(p.id)}
                    className={cn(
                      'inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                      isOn
                        ? 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                        : 'bg-blue-600 text-white hover:bg-blue-700',
                    )}
                  >
                    {isOn ? (
                      <>
                        管理绑定
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </>
                    ) : (
                      <>
                        <Plus className="mr-1 h-4 w-4" />
                        去绑定
                      </>
                    )}
                  </button>
                )}
              </div>

              {!isOn && !isJd ? (
                <p className="mt-3 text-center text-xs text-slate-400">点击「去绑定」进入商家版后台完成授权</p>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
