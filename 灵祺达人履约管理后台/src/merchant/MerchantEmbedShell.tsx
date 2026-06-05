import { NavLink, Outlet } from 'react-router-dom'
import MerchantEmbedErrorBoundary from './MerchantEmbedErrorBoundary'
import MerchantEmbedProviders from './MerchantEmbedProviders'
import '@merchant/index.css'
import './embed-text-utilities.css'
import './merchant-embed-theme.css'

const TABS = [
  { to: '/addons/shortvideo', label: '短视频AI处理' },
  { to: '/addons/ai-content', label: 'AI 文章与话题' },
  { to: '/addons/digital-human', label: '数字人口播' },
] as const

/** 商家版同源工作区 + 子 Tab（随履约后台明暗主题切换） */
export default function MerchantEmbedShell() {
  return (
    <MerchantEmbedErrorBoundary>
      <MerchantEmbedProviders>
      <div className="merchant-embed-root erp-main-surface min-h-full flex flex-col bg-[var(--shell-main-bg)] text-[var(--app-text)]">
        <div className="border-b border-[var(--shell-border)] bg-[var(--panel-card)] px-4 py-2 flex flex-wrap gap-2 shrink-0">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium ${
                  isActive
                    ? 'bg-violet-600 text-white'
                    : 'text-[var(--shell-muted)] hover:bg-[var(--shell-hover)]'
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
    </MerchantEmbedErrorBoundary>
  )
}
