import { NavLink, Outlet } from 'react-router-dom'
import MerchantEmbedProviders from './MerchantEmbedProviders'
import '@merchant/index.css'

const TABS = [
  { to: '/addons/shortvideo', label: '短视频AI处理' },
  { to: '/addons/ai-content', label: 'AI 文章与话题' },
  { to: '/addons/digital-human', label: '数字人口播' },
] as const

/** 商家版同源浅色工作区 + 子 Tab（功能与 merchant-erp 页面完全一致） */
export default function MerchantEmbedShell() {
  return (
    <MerchantEmbedProviders>
      <div className="erp-main-surface min-h-full flex flex-col">
        <div className="border-b border-slate-200/90 bg-white/90 px-4 py-2 flex flex-wrap gap-2 shrink-0">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium ${
                  isActive
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
        <div className="erp-main flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </div>
      </div>
    </MerchantEmbedProviders>
  )
}
