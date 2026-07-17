import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  isAddonNavPermEnabled,
  readAccountAddonAccess,
} from '../lib/addonAccess'
import { upgradePromptMessage, membershipUpgradePath } from '../lib/addonUpgradeHint'
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
  if (pathname === '/addons/ai-image') return '/addons/ai-image'
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

  const unlockedNav = useMemo(
    () => ADDON_NAV.filter((t) => isAddonNavPermEnabled(addonAccess, t.perm)),
    [addonAccess],
  )

  /** 全部矩阵能力入口都展示；未开通项点击提示升级 */
  const allNav = useMemo(
    () =>
      ADDON_NAV.map((t) => ({
        ...t,
        unlocked: isAddonNavPermEnabled(addonAccess, t.perm),
      })),
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
    if (syncing || !addonEnabled || !unlockedNav.length) return
    const target = resolveAddonNavTarget(location.pathname)
    if (!target) {
      if (location.pathname === '/addons' || location.pathname.startsWith('/addons/')) {
        navigate(unlockedNav[0]!.to, { replace: true })
      }
      return
    }
    if (unlockedNav.some((t) => t.to === target)) return
    navigate(unlockedNav[0]!.to, { replace: true })
  }, [syncing, addonEnabled, unlockedNav, location.pathname, navigate])

  const onNavClick = (t: (typeof allNav)[number]) => {
    if (!t.unlocked) {
      window.alert(upgradePromptMessage(t.label, t.perm))
      navigate(membershipUpgradePath())
      return
    }
    if (location.pathname !== t.to) navigate(t.to)
  }

  return (
    <MerchantEmbedProviders>
      <div className="merchant-embed-root erp-main-surface page-content-shell page-content-shell--wide flex min-h-full flex-col text-[var(--app-text)]">
        {syncing ? (
          <div className="erp-main merchant-embed-main flex flex-1 items-center justify-center p-6 text-sm text-[var(--shell-muted)]">
            正在同步增值服务开通状态…
          </div>
        ) : addonEnabled ? (
          <>
            {allNav.length > 0 ? (
              <nav
                className="shrink-0 border-b border-[var(--shell-border)] bg-[var(--panel-card)] px-4 py-2.5 md:px-6"
                aria-label="增值服务"
              >
                <div className="flex flex-wrap gap-2">
                  {allNav.map((t) => {
                    const active = isAddonNavTargetActive(t.to, location.pathname)
                    return (
                      <button
                        key={t.to}
                        type="button"
                        onClick={() => onNavClick(t)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                          active
                            ? 'bg-violet-600 text-white shadow-sm'
                            : t.unlocked
                              ? 'text-[var(--shell-muted)] hover:bg-[var(--shell-hover)] hover:text-[var(--shell-text)]'
                              : 'text-[var(--shell-muted)] opacity-60 hover:bg-[var(--shell-hover)]'
                        }`}
                        title={t.unlocked ? t.label : upgradePromptMessage(t.label, t.perm)}
                      >
                        {t.unlocked ? t.label : `${t.label} · 需升级`}
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
            <div className="mt-4 flex flex-wrap gap-2">
              {allNav.map((t) => (
                <button
                  key={t.to}
                  type="button"
                  onClick={() => onNavClick(t)}
                  className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm text-violet-800"
                >
                  {t.label} · 升级解锁
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </MerchantEmbedProviders>
  )
}
