import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { clearSession, getAccount, getActiveRole, isDevPreviewSession, type MpAccountRole } from '../lib/mpSession'

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
      { to: '/recommend-talent', label: '推荐达人' },
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
  const NAV = navForRole(role)

  function logout() {
    clearSession()
    nav('/', { replace: true })
  }

  const idLabel =
    role === 'pr'
      ? account?.lingqiPrId || '未绑定 PRID'
      : account?.lingqiTalentId || '未绑定达人ID'

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-white/10 bg-[#141422] p-4 flex flex-col shrink-0">
        <div className="mb-6">
          <div className="font-bold text-lg">灵祺履约后台</div>
          <div className="text-xs text-slate-400 mt-1">{role === 'pr' ? 'PR 版' : '达人版'} · {account?.wxNickName || account?.loginName || '未登录'}</div>
          <div className="text-xs text-amber-400 mt-1 font-mono">{idLabel}</div>
          {isDevPreviewSession() ? (
            <p className="text-[10px] text-amber-500/80 mt-1">开发预览模式</p>
          ) : null}
        </div>

        <nav className="flex-1 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-violet-600/30 text-white' : 'text-slate-400 hover:bg-white/5'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button type="button" className="text-sm text-slate-500 hover:text-white mt-4" onClick={logout}>
          退出登录
        </button>
      </aside>
      <main className="flex-1 p-6 overflow-auto min-w-0">
        <Outlet />
      </main>
    </div>
  )
}
