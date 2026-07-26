import { Building2, LayoutDashboard, LogOut, Settings, Wallet } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { cn } from '../lib/cn'
import { readSession, writeSession, type RegionalPartnerModuleKey } from '../lib/api'

const NAV: Array<{
  to: string
  label: string
  icon: typeof LayoutDashboard
  perm?: RegionalPartnerModuleKey
}> = [
  { to: '/', label: '业绩看板', icon: LayoutDashboard, perm: 'dashboard' },
  { to: '/merchants', label: '名下商家', icon: Building2, perm: 'merchants' },
  { to: '/settlement', label: '结算明细', icon: Wallet, perm: 'settlement' },
  { to: '/settings', label: '账号资料', icon: Settings },
]

export default function Layout() {
  const session = readSession()
  const navigate = useNavigate()
  const perms = new Set(session?.permissions ?? [])

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl gap-6 px-4 py-6 md:px-6">
      <aside className="hidden w-56 shrink-0 flex-col rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 md:flex">
        <div className="mb-6">
          <p className="font-[DM_Sans] text-lg font-bold tracking-tight text-white">灵祺 · 区域服务商</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{session?.companyName || session?.phone}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.filter((n) => !n.perm || perms.has(n.perm)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition',
                  isActive
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'text-[var(--muted)] hover:bg-white/5 hover:text-white',
                )
              }
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => {
            writeSession(null)
            navigate('/login', { replace: true })
          }}
          className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--muted)] hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mb-4 flex gap-2 overflow-x-auto md:hidden">
          {NAV.filter((n) => !n.perm || perms.has(n.perm)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap rounded-full border px-3 py-1.5 text-xs',
                  isActive
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--line)] text-[var(--muted)]',
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </div>
        <Outlet />
      </main>
    </div>
  )
}
