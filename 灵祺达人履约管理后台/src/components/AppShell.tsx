import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import PlatformDecorDrHost from './PlatformDecorDrHost'
import ThemeToggle from './ThemeToggle'
import IdentitySwitchPanel from './IdentitySwitchPanel'
import AppTopBar from './AppTopBar'
import { clearSession, getAccount, getActiveRole } from '../lib/mpSession'
import { clearMpRegistryCache } from '../lib/mpApi'
import { getWorkIdentity, WORK_EDITION_LABEL } from '../lib/mpWorkIdentity'
import { isShellNavItemActive, navItemsForRole } from '../lib/shellNavConfig'
import { identityWorkAttr } from '../lib/identityTheme'
import SiteIcpFooter from '@merchant/components/SiteIcpFooter'
import { BRAND_LOGO_URL, BRAND_NAME_SHORT } from '../lib/brand'
import { onShellRefresh } from '../lib/shellRefresh'
import { syncAccountAccessOnBoot } from '../lib/registryProfileSync'

export default function AppShell() {
  const nav = useNavigate()
  const location = useLocation()
  const [shellRev, setShellRev] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => onShellRefresh(() => setShellRev((n) => n + 1)), [])
  useEffect(() => {
    void syncAccountAccessOnBoot()
  }, [])
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname, location.search])
  void shellRev

  const account = getAccount()
  const role = getActiveRole()
  const workId = getWorkIdentity()
  const NAV = navItemsForRole(role, account)

  function logout() {
    if (
      !window.confirm(
        '退出后将清除本机全部报名、资料与消息缓存，避免串到其他账号。确定退出？',
      )
    ) {
      return
    }
    clearSession()
    clearMpRegistryCache()
    nav('/', { replace: true })
  }

  const shellWorkId = role === 'pr' ? 'pr' : workId
  const editionLabel = role === 'pr' ? 'PR 版' : WORK_EDITION_LABEL[workId]

  const navLinkClass = (to: string) =>
    `xx-header-link ${isShellNavItemActive(to, location.pathname, location.search) ? 'xx-header-link--active' : ''}`

  return (
    <div
      className="app-frame xx-erp-shell min-h-screen"
      data-work-identity={identityWorkAttr(shellWorkId)}
    >
      <header className="xx-header-bar">
        <div className="xx-header-bar__row">
          <button
            type="button"
            className="xx-header-icon-btn lg:hidden"
            aria-label="打开菜单"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <NavLink to="/hall?tab=home" className="xx-header-brand">
            <img src={BRAND_LOGO_URL} alt={BRAND_NAME_SHORT} className="xx-header-brand__logo" />
            <span className="xx-header-brand__name">
              灵祺星选
              <em>{editionLabel}</em>
            </span>
          </NavLink>

          <nav className="xx-header-nav" aria-label="主导航">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass(item.to)}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="xx-header-actions">
            <div className="xx-header-tools hidden lg:flex">
              <IdentitySwitchPanel />
              <ThemeToggle />
              <button type="button" className="xx-logout-btn xx-logout-btn--inline" onClick={logout}>
                退出
              </button>
            </div>
            <AppTopBar variant="header" />
          </div>
        </div>
      </header>

      <div className="xx-subbar">
        <AppTopBar variant="crumb" />
      </div>

      {mobileOpen ? (
        <div className="xx-mobile-mask" role="presentation">
          <button
            type="button"
            className="xx-mobile-mask__backdrop"
            aria-label="关闭菜单"
            onClick={() => setMobileOpen(false)}
          />
          <div className="xx-mobile-drawer" role="dialog" aria-label="导航菜单">
            <div className="xx-mobile-drawer__head">
              <span>菜单</span>
              <button type="button" className="xx-header-icon-btn" aria-label="关闭" onClick={() => setMobileOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="xx-mobile-drawer__nav">
              {NAV.map((item) => (
                <NavLink key={item.to} to={item.to} className={navLinkClass(item.to)} onClick={() => setMobileOpen(false)}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="xx-mobile-drawer__foot">
              <IdentitySwitchPanel />
              <ThemeToggle />
              <button type="button" className="xx-logout-btn" onClick={logout}>
                退出登录
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="app-main-wrap">
        <main className="app-main">
          <div className="xx-content-plate">
            <PlatformDecorDrHost />
            <Outlet key={`${shellWorkId}-${role}`} />
          </div>
        </main>
        <footer className="app-site-footer">
          <p className="xx-footer-links">
            <NavLink to="/help">帮助手册</NavLink>
            <NavLink to="/team">关于我们</NavLink>
            <NavLink to="/legal/privacy">隐私政策</NavLink>
          </p>
          <SiteIcpFooter className="text-[var(--shell-muted)]" />
        </footer>
      </div>

      <div className="xx-side-rail">
        <Link to="/hall?tab=recommend" className="xx-side-tab xx-side-tab--stack">
          <span className="xx-side-tab__latin">AI</span>
          <span>匹</span>
          <span>配</span>
        </Link>
        <Link to="/support" className="xx-side-tab">
          在线客服
        </Link>
      </div>
    </div>
  )
}
