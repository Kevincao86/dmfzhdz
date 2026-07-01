import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { canUsePaidAddons } from '../lib/addonAccess'
import { getAccount } from '../lib/mpSession'
import { pullRegistryProfileAfterLogin } from '../lib/registryProfileSync'
import { onShellRefresh } from '../lib/shellRefresh'
import { ADDON_NAV } from './embedPages'
import AddonComingSoon from './AddonComingSoon'
import MerchantEmbedErrorBoundary from './MerchantEmbedErrorBoundary'
import MerchantEmbedProviders from './MerchantEmbedProviders'
import './embed-text-utilities.css'
import './merchant-embed-theme.css'

/** 商家 Web 同源三板块嵌入壳（短视频 / AI 文章 / 数字人），随履约后台明暗主题切换 */
export default function MerchantEmbedShell() {
  const [addonEnabled, setAddonEnabled] = useState(() => canUsePaidAddons())
  const [syncing, setSyncing] = useState(true)

  useEffect(() => {
    let cancelled = false
    const refresh = () => setAddonEnabled(canUsePaidAddons(getAccount()))

    const unsub = onShellRefresh(refresh)
    void pullRegistryProfileAfterLogin()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          refresh()
          setSyncing(false)
        }
      })

    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  return (
    <MerchantEmbedProviders>
      <div className="merchant-embed-root erp-main-surface page-content-shell page-content-shell--wide flex min-h-full flex-col text-[var(--app-text)]">
        {syncing && !addonEnabled ? (
          <div className="erp-main merchant-embed-main flex flex-1 items-center justify-center p-6 text-sm text-[var(--shell-muted)]">
            正在同步增值服务开通状态…
          </div>
        ) : addonEnabled ? (
          <>
            <nav
              className="shrink-0 border-b border-[var(--shell-border)] bg-[var(--panel-card)] px-4 py-2.5 md:px-6"
              aria-label="增值服务"
            >
              <div className="flex flex-wrap gap-2">
                {ADDON_NAV.map((t) => (
                  <NavLink
                    key={t.to}
                    to={t.to}
                    className={({ isActive }) =>
                      `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'text-[var(--shell-muted)] hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text)]'
                      }`
                    }
                  >
                    {t.label}
                  </NavLink>
                ))}
              </div>
            </nav>
            <div className="erp-main merchant-embed-main flex-1 overflow-auto p-6 lg:p-8">
              <MerchantEmbedErrorBoundary>
                <Outlet />
              </MerchantEmbedErrorBoundary>
            </div>
          </>
        ) : (
          <div className="erp-main merchant-embed-main flex-1 overflow-auto p-6 lg:p-8">
            <AddonComingSoon />
          </div>
        )}
      </div>
    </MerchantEmbedProviders>
  )
}
