import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { switchRole } from '../lib/mpApi'
import {
  clearSession,
  getAccount,
  getActiveRole,
  getToken,
  setActiveRole,
  setSession,
  type MpAccountRole,
} from '../lib/mpSession'

const NAV = [
  { to: '/hall', label: '招募大厅' },
  { to: '/orders', label: '我的履约' },
  { to: '/messages', label: '消息' },
  { to: '/profile', label: '我的' },
]

export default function AppShell() {
  const nav = useNavigate()
  const account = getAccount()
  const role = getActiveRole()

  async function onSwitchRole(next: MpAccountRole) {
    if (!getToken()) return
    try {
      const { account: acc } = await switchRole(next)
      setSession(getToken(), acc)
      setActiveRole(next)
      window.location.reload()
    } catch (e) {
      alert(e instanceof Error ? e.message : '切换失败')
    }
  }

  function logout() {
    clearSession()
    nav('/login', { replace: true })
  }

  const idLabel =
    role === 'pr'
      ? account?.lingqiPrId || '未绑定 PRID'
      : account?.lingqiTalentId || '未绑定达人ID'

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-white/10 bg-[#141422] p-4 flex flex-col">
        <div className="mb-6">
          <div className="font-bold text-lg">灵祺履约后台</div>
          <div className="text-xs text-slate-400 mt-1">{account?.wxNickName || account?.loginName || '未登录'}</div>
          <div className="text-xs text-amber-400 mt-1 font-mono">{idLabel}</div>
        </div>

        <div className="mb-4 flex gap-1 rounded-lg bg-black/30 p-1">
          <button
            type="button"
            className={`flex-1 text-xs py-1.5 rounded-md ${role === 'talent' ? 'bg-violet-600' : ''}`}
            onClick={() => void onSwitchRole('talent')}
          >
            达人版
          </button>
          <button
            type="button"
            className={`flex-1 text-xs py-1.5 rounded-md ${role === 'pr' ? 'bg-orange-600' : ''}`}
            onClick={() => void onSwitchRole('pr')}
          >
            PR 版
          </button>
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
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
