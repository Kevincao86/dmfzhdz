import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import IdentitySwitchPanel from './IdentitySwitchPanel'
import AppTopBar from './AppTopBar'
import { clearSession, getAccount, getActiveRole } from '../lib/mpSession'
import { clearMpRegistryCache } from '../lib/mpApi'
import { readPrProfile } from '../lib/mpSync/userProfile'
import { readMember } from '../lib/mpSync/talentMember'
import { getWorkIdentity, WORK_EDITION_LABEL } from '../lib/mpWorkIdentity'
import { navItemsForRole } from '../lib/shellNavConfig'
import { identitySidebarMascotSrc } from '../lib/identityMascotAssets'
import { identityShellClass, identityWorkAttr } from '../lib/identityTheme'
import { BRAND_LOGO_URL, BRAND_NAME_SHORT } from '../lib/brand'
import { onShellRefresh } from '../lib/shellRefresh'

export default function AppShell() {
  const nav = useNavigate()
  const [shellRev, setShellRev] = useState(0)
  useEffect(() => onShellRefresh(() => setShellRev((n) => n + 1)), [])
  void shellRev

  const account = getAccount()
  const role = getActiveRole()
  const workId = getWorkIdentity()
  const NAV = navItemsForRole(role)

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

  const prProfile = role === 'pr' ? readPrProfile() : null
  const member = role !== 'pr' ? readMember() : null
  const idLabel =
    role === 'pr'
      ? account?.lingqiPrId || prProfile?.lingqiPrId || '未绑定 PRID'
      : workId === 'shoot'
        ? member?.lingqiShootTeamId || account?.lingqiShootTeamId || '未绑定拍摄团队ID'
        : workId === 'edit'
          ? member?.lingqiEditTeamId || account?.lingqiEditTeamId || '未绑定剪辑团队ID'
          : account?.lingqiTalentId || member?.lingqiTalentId || '未绑定达人ID'

  const shellWorkId = role === 'pr' ? 'pr' : workId
  const editionLabel = role === 'pr' ? 'PR 版' : WORK_EDITION_LABEL[workId]
  const sidebarTone = identityShellClass(shellWorkId)

  return (
    <div className="app-frame min-h-screen text-[var(--app-text)]" data-work-identity={identityWorkAttr(shellWorkId)}>
      <aside className={`app-sidebar ${sidebarTone}`}>
        <div className="app-sidebar__brand">
          <img src={BRAND_LOGO_URL} alt={BRAND_NAME_SHORT} className="app-sidebar__logo" />
          <div className="min-w-0">
            <div className="app-sidebar__title">灵祺星选平台</div>
            <div className="app-sidebar__edition">{editionLabel}</div>
          </div>
        </div>
        <p className="app-sidebar__slogan">让好内容，遇见好机会</p>

        <nav className="app-sidebar__nav">
          {NAV.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `shell-nav-link ${isActive ? 'shell-nav-link--active' : ''}`
                }
              >
                <Icon size={18} strokeWidth={2} className="shell-nav-link__icon" aria-hidden />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="app-sidebar__mascot" aria-hidden>
          <div className="app-sidebar__mascot-glow" />
          <img
            src={identitySidebarMascotSrc(workId)}
            alt=""
            className="app-sidebar__mascot-img"
            draggable={false}
          />
        </div>

        <Link to="/hall?tab=recommend" className="app-sidebar__promo no-underline">
          <div className="app-sidebar__promo-title">AI 智能匹配</div>
          <p className="app-sidebar__promo-text">完善资料后，系统将按标签与习惯为您推荐更契合的商单与达人。</p>
        </Link>

        <div className="app-sidebar__footer">
          <div className="app-sidebar__id font-mono">{idLabel}</div>
          <IdentitySwitchPanel />
          <ThemeToggle />
          <button type="button" className="shell-nav-link shell-nav-link--ghost" onClick={logout}>
            退出登录
          </button>
        </div>
      </aside>

      <div className="app-main-wrap">
        <AppTopBar />
        <main className="app-main">
          <Outlet key={`${shellWorkId}-${role}-${shellRev}`} />
        </main>
      </div>
    </div>
  )
}
