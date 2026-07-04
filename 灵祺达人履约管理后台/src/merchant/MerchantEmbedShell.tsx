import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  isAddonNavPermEnabled,
  readAccountAddonAccess,
} from '../lib/addonAccess'
import { getAccount } from '../lib/mpSession'
import { pullRegistryProfileAfterLogin } from '../lib/registryProfileSync'
import { onShellRefresh } from '../lib/shellRefresh'
import { ADDON_NAV } from './embedPages'
import AddonComingSoon from './AddonComingSoon'
import MerchantEmbedErrorBoundary from './MerchantEmbedErrorBoundary'
import MerchantEmbedProviders from './MerchantEmbedProviders'
import './embed-text-utilities.css'
import './merchant-embed-theme.css'

/** 精确匹配增值子路由，避免 startsWith 误判 */
function resolveAddonNavTarget(pathname: string): string | null {
  if (pathname === '/addons/ai-content' || pathname.startsWith('/addons/ai-content/')) {
    return '/addons/ai-content'
  }
  if (pathname === '/addons/ai-review' || pathname === '/addons/ai-video-review') {
    return '/addons/ai-review'
  }
  if (pathname === '/addons/shortvideo') return '/addons/shortvideo'
  if (pathname === '/addons/digital-human') return '/addons/digital-human'
  return null
}

function isAddonNavTargetActive(navTo: string, pathname: string): boolean {
  return resolveAddonNavTarget(pathname) === navTo
}

/** 商家 Web 同源三板块嵌入壳（短视频 / AI 文章 / 数字人），随履约后台明暗主题切换 */
export default function MerchantEmbedShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const [addonAccess, setAddonAccess] = useState(() => readAccountAddonAccess())
  const addonEnabled = addonAccess.any
  const [syncing, setSyncing] = useState(true)

  const visibleNav = useMemo(
    () => ADDON_NAV.filter((t) => isAddonNavPermEnabled(addonAccess, t.perm)),
    [addonAccess],
  )

  useEffect(() => {
    let cancelled = false
    const refresh = () => setAddonAccess(readAccountAddonAccess(getAccount()))

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

  useEffect(() => {
    if (syncing || !addonEnabled || !visibleNav.length) return
    const target = resolveAddonNavTarget(location.pathname)
    if (!target) {
      if (location.pathname === '/addons' || location.pathname.startsWith('/addons/')) {
        navigate(visibleNav[0]!.to, { replace: true })
      }
      return
    }
    if (visibleNav.some((t) => t.to === target)) return
    navigate(visibleNav[0]!.to, { replace: true })
  }, [syncing, addonEnabled, visibleNav, location.pathname, navigate])

  return (
    <MerchantEmbedProviders>
      <div className="merchant-embed-root erp-main-surface page-content-shell page-content-shell--wide flex min-h-full flex-col text-[var(--app-text)]">
        {syncing ? (
          <div className="erp-main merchant-embed-main flex flex-1 items-center justify-center p-6 text-sm text-[var(--shell-muted)]">
            正在同步增值服务开通状态…
          </div>
        ) : addonEnabled ? (
          <>
            {visibleNav.length > 0 ? (
              <nav
                className="shrink-0 border-b border-[var(--shell-border)] bg-[var(--panel-card)] px-4 py-2.5 md:px-6"
                aria-label="增值服务"
              >
                <div className="flex flex-wrap gap-2">
                  {visibleNav.map((t) => {
                    const active = isAddonNavTargetActive(t.to, location.pathname)
                    return (
                      <button
                        key={t.to}
                        type="button"
                        onClick={() => {
                          if (location.pathname !== t.to) navigate(t.to)
                        }}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                          active
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'text-[var(--shell-muted)] hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text)]'
                        }`}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </nav>
            ) : null}
            <div className="erp-main merchant-embed-main flex-1 overflow-auto p-6 lg:p-8">
              <MerchantEmbedErrorBoundary>
                <Outlet key={location.pathname} />
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
