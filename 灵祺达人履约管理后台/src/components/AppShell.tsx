import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import PlatformDecorDrHost from './PlatformDecorDrHost'
import ThemeToggle from './ThemeToggle'
import AppTopBar from './AppTopBar'
import { clearSession, getAccount, getActiveRole } from '../lib/mpSession'
import { clearMpRegistryCache } from '../lib/mpApi'
import { getWorkIdentity, WORK_EDITION_LABEL } from '../lib/mpWorkIdentity'
import { isShellNavItemActive, navItemsForRole } from '../lib/shellNavConfig'
import { identityWorkAttr } from '../lib/identityTheme'
import SiteIcpFooter from '@merchant/components/SiteIcpFooter'
import { LEGAL_COMPANY_NAME } from '@merchant/lib/legalProductMeta'
import { BRAND_LOGO_URL, BRAND_NAME_SHORT } from '../lib/brand'
import { onShellRefresh } from '../lib/shellRefresh'
import { syncAccountAccessOnBoot } from '../lib/registryProfileSync'

const MENU_GUIDE_COPY: Record<string, string> = {
  招募大厅: '首页点商单即可报名，常用入口可进日历和审核。推荐里左右滑动看轮播达人，并用智能匹配找合适对象。',
  发布招募: '按步骤填写商单要求并发布。发布后到「我的发单」跟进报名。',
  我的发单: '查看已发商单的报名、排期和审核进度，点进一条继续处理。',
  我的报名: '查看报名进度。待探店、待传视频的任务从这里进入下一步。',
  商单日历: '按日期查看探店、交片和待办，点某一天处理当天的事。',
  转发工具: '把报名表转给达人填写，回收后在这里查看结果。',
  我的模版: '保存常用招募或报名模版，下次发单或报名时直接套用。',
  培训课程: '查看可报名的课程。讲师可以在这里发布和结算自己的课程。',
  AI视频审核: '用 AI 审视频和文稿，支持单条和批量。',
  消息: '「私信」用来一对一沟通，「群聊」用来跟进合作群。点进会话即可回复。',
  增值服务: '这里是 AI 创作工坊，可使用短视频、数字人、视觉工坊和云剪。',
  我的: '先完成账号绑定。这里还有 AI 视频审核和我的推广。',
}

type MenuGuideState = { index: number; steps: { label: string; body: string }[] }

export default function AppShell() {
  const nav = useNavigate()
  const location = useLocation()
  const [shellRev, setShellRev] = useState(0)
  useEffect(() => onShellRefresh(() => setShellRev((n) => n + 1)), [])
  useEffect(() => {
    void syncAccountAccessOnBoot()
  }, [])
  void shellRev

  const account = getAccount()
  const role = getActiveRole()
  const workId = getWorkIdentity()
  const NAV = navItemsForRole(role, account)
  const orderIdx = NAV.findIndex((item) => item.to === '/profile/ai-review')
  const useMoreMenu = orderIdx >= 5 && orderIdx < NAV.length - 1
  const primaryNav = useMoreMenu ? NAV.slice(0, orderIdx + 1) : NAV
  const moreNav = useMoreMenu ? NAV.slice(orderIdx + 1) : []
  const [moreOpen, setMoreOpen] = useState(false)
  const [menuGuide, setMenuGuide] = useState<MenuGuideState | null>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const guideLabel = menuGuide ? menuGuide.steps[menuGuide.index]?.label || '' : ''

  const signedIn = Boolean(account)
  useEffect(() => {
    if (!signedIn) return
    const key = `xx_menu_guide_v2_${role}`
    try {
      if (window.localStorage.getItem(key)) return
    } catch {
      return
    }
    const steps = navItemsForRole(role, getAccount()).map((item) => ({
      label: item.label,
      body: MENU_GUIDE_COPY[item.label] || `打开「${item.label}」后，按页面上的按钮完成对应操作。`,
    }))
    if (!steps.length) return
    const timer = window.setTimeout(() => {
      setMenuGuide((current) => current || { index: 0, steps })
    }, 600)
    return () => window.clearTimeout(timer)
  }, [signedIn, role])

  useEffect(() => {
    if (!guideLabel) return
    const items = navItemsForRole(role, getAccount())
    const orderIdx = items.findIndex((item) => item.to === '/profile/ai-review')
    const useMore = orderIdx >= 5 && orderIdx < items.length - 1
    const more = useMore ? items.slice(orderIdx + 1) : []
    if (more.some((item) => item.label === guideLabel)) setMoreOpen(true)
  }, [guideLabel, role])

  function finishMenuGuide() {
    const key = `xx_menu_guide_v2_${role}`
    try {
      window.localStorage.setItem(key, '1')
    } catch {
      /* ignore */
    }
    setMenuGuide(null)
    setMoreOpen(false)
  }

  function nextMenuGuide() {
    if (!menuGuide) return
    if (menuGuide.index >= menuGuide.steps.length - 1) {
      finishMenuGuide()
      return
    }
    setMenuGuide({ ...menuGuide, index: menuGuide.index + 1 })
  }

  useEffect(() => {
    setMoreOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!moreOpen) return
    function onDocClick(ev: MouseEvent) {
      if (!moreRef.current?.contains(ev.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [moreOpen])

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
      <header className="xx-header-bar" style={menuGuide ? { zIndex: 90 } : undefined}>
        <div className="xx-header-bar__row">
          <NavLink to="/hall?tab=home" className="xx-header-brand">
            <img src={BRAND_LOGO_URL} alt={BRAND_NAME_SHORT} className="xx-header-brand__logo" />
            <span className="xx-header-brand__name">
              灵祺星选
              <em>{editionLabel}</em>
            </span>
          </NavLink>

          <div className="xx-header-nav-cluster" style={menuGuide ? { pointerEvents: 'none' } : undefined}>
          <nav className="xx-header-nav" aria-label="主导航">
            {primaryNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={navLinkClass(item.to)}
                style={guideLabel === item.label ? { outline: '2px solid #ddd6fe', outlineOffset: '4px', borderRadius: '999px' } : undefined}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          {moreNav.length > 0 ? (
            <div className="xx-header-more" ref={moreRef}>
              <button
                type="button"
                className={`xx-header-link xx-header-more__btn${
                  moreOpen || moreNav.some((item) => isShellNavItemActive(item.to, location.pathname, location.search))
                    ? ' xx-header-link--active'
                    : ''
                }`}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
              >
                更多
                <ChevronDown className="xx-header-more__chevron" aria-hidden />
              </button>
              {moreOpen ? (
                <div className="xx-header-more__menu" role="menu">
                  {moreNav.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      role="menuitem"
                      className={`xx-header-more__item${
                        isShellNavItemActive(item.to, location.pathname, location.search)
                          ? ' xx-header-more__item--active'
                          : ''
                      }`}
                      style={guideLabel === item.label ? { outline: '2px solid #7c5cff', outlineOffset: '2px' } : undefined}
                      onClick={() => setMoreOpen(false)}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          </div>

          <div className="xx-header-actions">
            <div className="xx-header-tools flex">
              <span className="px-3 text-sm text-[var(--shell-muted)]">{WORK_EDITION_LABEL[getWorkIdentity()]}</span>
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

      {menuGuide ? (
        <>
          <div className="fixed inset-0 z-[80] bg-slate-950/45" />
          <div className="fixed left-1/2 top-20 z-[91] w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 rounded-2xl bg-white p-5 text-slate-900 shadow-2xl">
            <p className="text-xs font-semibold text-violet-600">
              操作指引 {menuGuide.index + 1}/{menuGuide.steps.length}
            </p>
            <h2 className="mt-1 text-lg font-bold">{menuGuide.steps[menuGuide.index].label}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{menuGuide.steps[menuGuide.index].body}</p>
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" className="rounded-full bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-600" onClick={finishMenuGuide}>
                跳过
              </button>
              <button type="button" className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white" onClick={nextMenuGuide}>
                {menuGuide.index >= menuGuide.steps.length - 1 ? '知道了' : '下一步'}
              </button>
            </div>
          </div>
        </>
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
            <NavLink to="/help">使用说明</NavLink>
            <NavLink to="/team">关于我们</NavLink>
            <NavLink to="/legal/privacy">隐私政策</NavLink>
          </p>
          <p className="xx-footer-links">© {new Date().getFullYear()} {LEGAL_COMPANY_NAME} Copyright. All Rights Reserved.</p>
          <SiteIcpFooter className="text-[var(--shell-muted)]" />
        </footer>
      </div>
    </div>
  )
}
