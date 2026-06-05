import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '../cn'
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

/** 商家 Web 同源工作区（erp-main-surface + erp-main），顶栏 Tab 对齐 AI 文章页分段样式 */
export default function MerchantEmbedShell() {
  return (
    <MerchantEmbedErrorBoundary>
      <MerchantEmbedProviders>
        <div className="merchant-embed-root erp-main-surface flex min-h-full flex-col">
          <div className="merchant-embed-tabs shrink-0 px-4 py-3 md:px-6 lg:px-8">
            <nav className="merchant-embed-tabs__group" aria-label="增值服务">
              {TABS.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  className={({ isActive }) =>
                    cn('merchant-embed-tabs__link', isActive && 'merchant-embed-tabs__link--active')
                  }
                >
                  {t.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="erp-main flex-1 overflow-auto p-6 lg:p-8">
            <Outlet />
          </div>
        </div>
      </MerchantEmbedProviders>
    </MerchantEmbedErrorBoundary>
  )
}
