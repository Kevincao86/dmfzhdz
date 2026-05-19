import { Plus } from 'lucide-react'
import { useState } from 'react'
import {
  PlatformBrandLogo,
  PlatformLogoPlaceholder,
  SOCIAL_PLATFORM_BRANDS,
} from '../../lib/platformBranding'

const MAX_ACCOUNTS = 3

export default function PlatformConnectionsPanel() {
  const [bindHint, setBindHint] = useState<string | null>(null)

  const onBind = (name: string) => {
    setBindHint(`${name}社交账号绑定即将上线，敬请期待。`)
    window.setTimeout(() => setBindHint(null), 4000)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white px-4 py-4 sm:px-5">
        <h3 className="text-lg font-semibold text-slate-900">平台账号绑定</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          绑定您的<strong className="font-medium text-slate-800">用户侧社交账号</strong>
          （如抖音、小红书、大众点评等），用于内容发布、账号运营与数据同步。此处为
          <strong className="font-medium text-slate-800"> C 端/创作者账号</strong>，与下方「商家版后台」中的
          抖音来客、大众点评商家版等<strong className="font-medium text-slate-800">经营侧授权</strong>
          相互独立。每个平台最多绑定 {MAX_ACCOUNTS} 个账号。
        </p>
        {bindHint ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {bindHint}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {SOCIAL_PLATFORM_BRANDS.map((p) => {
          const isJd = p.id === 'jd'
          return (
            <div
              key={p.id}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {p.logo ? (
                    <PlatformBrandLogo logo={p.logo} alt={p.shortName} size="md" />
                  ) : (
                    <PlatformLogoPlaceholder label="JD" size="md" />
                  )}
                  <div className="min-w-0">
                    <h4 className="font-semibold text-slate-900">{p.shortName}</h4>
                    <p className="mt-0.5 text-sm text-slate-500">
                      未连接 · 最多 {MAX_ACCOUNTS} 个
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {isJd ? '即将开放' : '未连接'}
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
                    onClick={() => onBind(p.shortName)}
                    className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    去绑定
                  </button>
                )}
              </div>

              {!isJd ? (
                <p className="mt-3 text-center text-xs text-slate-400">
                  绑定后可在此管理社交账号授权（功能开发中）
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
