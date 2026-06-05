import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import IdentitySwitchPanel from './IdentitySwitchPanel'
import { clearSession, getAccount, getActiveRole, type MpAccountRole } from '../lib/mpSession'
import { readPrProfile } from '../lib/mpSync/userProfile'
import { getWorkIdentity, WORK_EDITION_LABEL } from '../lib/mpWorkIdentity'

type NavItem = { to: string; label: string; roles?: MpAccountRole[] }

function navForRole(role: MpAccountRole): NavItem[] {
  const common: NavItem[] = [
    { to: '/messages', label: '消息' },
    { to: '/addons', label: '增值服务' },
    { to: '/profile', label: '我的' },
  ]
  if (role === 'pr') {
    return [
      { to: '/hall', label: '招募大厅' },
      { to: '/publish', label: '发布招募' },
      { to: '/templates', label: '我的模版' },
      { to: '/orders', label: '我的发单' },
      ...common,
    ]
  }
  return [
    { to: '/hall', label: '招募大厅' },
    { to: '/orders', label: '我的履约' },
    ...common,
  ]
}

export default function AppShell() {
  const nav = useNavigate()
  const account = getAccount()
  const role = getActiveRole()
  const workId = getWorkIdentity()
  const NAV = navForRole(role)

  function logout() {
    clearSession()
    nav('/', { replace: true })
  }

  const prProfile = role === 'pr' ? readPrProfile() : null
  const idLabel =
    role === 'pr'
      ? account?.lingqiPrId || prProfile?.lingqiPrId || '未绑定 PRID'
      : account?.lingqiTalentId || '未绑定达人ID'

  const editionLabel = role === 'pr' ? 'PR 版' : WORK_EDITION_LABEL[workId]

  return (
    <div className="min-h-screen flex bg-[var(--shell-main-bg)] text-[var(--app-text)]">
      <aside className="w-56 border-r border-[var(--shell-border)] bg-[var(--shell-sidebar-bg)] p-4 flex flex-col shrink-0">
        <div className="mb-6">
          <div className="font-bold text-lg text-[var(--shell-text)]">灵祺星选平台</div>
          <div className="text-xs text-[var(--shell-muted)] mt-1">
            {editionLabel} · {account?.wxNickName || account?.loginName || '未登录'}
          </div>
          <div className="text-xs text-amber-500 mt-1 font-mono">{idLabel}</div>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm ${
                  isActive
                    ? 'bg-violet-600/30 text-[var(--shell-text)]'
                    : 'text-[var(--shell-muted)] hover:bg-[var(--shell-hover)]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-4 space-y-2">
          <IdentitySwitchPanel />
          <ThemeToggle />
          <button
            type="button"
            className="w-full text-sm text-[var(--shell-muted)] hover:text-[var(--shell-text)] text-left px-3 py-2"
            onClick={logout}
          >
            退出登录
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto min-w-0">
        <Outlet />
      </main>
    </div>
  )
}
