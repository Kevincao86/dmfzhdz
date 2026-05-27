import {
  Bot,
  Building2,
  CreditCard,
  Headphones,
  LayoutDashboard,
  Library,
  LogOut,
  Megaphone,
  Shield,
  Smartphone,
  UserSearch,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../cn'
import { BRAND_LOGO_URL, BRAND_NAME } from '../lib/brand'
import {
  clearOpsSession,
  isSuperAdmin,
  readOpsSession,
  refreshOpsSessionFromStorage,
  sessionHasPermission,
  type OpsPermissionKey,
  type OpsSession,
} from './opsStaffAuth'

const OPS_NAV: {
  to: string
  label: string
  icon: typeof Building2
  permission: OpsPermissionKey | 'staff_admin' | 'home'
}[] = [
  { to: '/', label: '首页', icon: LayoutDashboard, permission: 'home' },
  { to: '/customers', label: '客户管理', icon: Building2, permission: 'customers' },
  { to: '/announcements', label: '公告栏推送', icon: Megaphone, permission: 'announcements' },
  { to: '/payment-orders', label: '订单管理', icon: CreditCard, permission: 'payment_orders' },
  { to: '/accounts', label: '账号与权限', icon: Shield, permission: 'staff_admin' },
  { to: '/recruitment-orders', label: '商家达人招募订单', icon: UserSearch, permission: 'recruitment_orders' },
  { to: '/mp-recruitment-orders', label: '小程序达人招募订单', icon: Smartphone, permission: 'mp_recruitment_orders' },
  { to: '/talent-library', label: '灵祺达人库', icon: Library, permission: 'talent_library' },
  { to: '/ai-models', label: 'AI 模型', icon: Bot, permission: 'ai_models' },
  { to: '/support', label: '在线客服', icon: Headphones, permission: 'support' },
]

function navVisible(session: OpsSession, item: (typeof OPS_NAV)[number]): boolean {
  if (item.permission === 'home') return true
  if (item.permission === 'staff_admin') return isSuperAdmin(session)
  return sessionHasPermission(session, item.permission)
}

export default function OpsAdminLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [session, setSession] = useState<OpsSession | null>(() => readOpsSession())

  useEffect(() => {
    setSession(refreshOpsSessionFromStorage())
    const onChange = () => setSession(refreshOpsSessionFromStorage())
    window.addEventListener('meoo-ops-staff-changed', onChange)
    return () => window.removeEventListener('meoo-ops-staff-changed', onChange)
  }, [])

  const visibleNav = useMemo(
    () => (session ? OPS_NAV.filter((item) => navVisible(session, item)) : []),
    [session],
  )

  const logout = () => {
    clearOpsSession()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-56 flex-col border-r border-slate-800 bg-slate-900">
        <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-4">
          <img src={BRAND_LOGO_URL} alt={BRAND_NAME} className="h-9 w-9 shrink-0 rounded-lg object-contain" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">运营管控台</div>
            <div className="truncate text-[10px] text-slate-500">{BRAND_NAME}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {visibleNav.map(({ to, label, icon: Icon }) => {
            const active =
              to === '/'
                ? pathname === '/' || pathname === ''
                : pathname === to || pathname.startsWith(`${to}/`)
            return (
              <NavLink
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-90" />
                {label}
              </NavLink>
            )
          })}
        </nav>
        {session ? (
          <div className="border-t border-slate-800 p-3">
            <p className="truncate text-xs font-medium text-slate-200">{session.displayName}</p>
            <p className="truncate font-mono text-[10px] text-slate-500">{session.phone}</p>
            <p className="mt-0.5 text-[10px] text-indigo-400/90">
              {session.role === 'super_admin' ? '超级管理员' : '运营子账号'}
            </p>
            <button
              type="button"
              onClick={logout}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              <LogOut className="h-3.5 w-3.5" />
              退出登录
            </button>
          </div>
        ) : null}
      </aside>

      <div className="ml-56 flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900/95 px-6 backdrop-blur">
          <p className="text-xs text-slate-500">
            客户全生命周期 · 账号权限 · 订单中枢 · AI 与客服对接（三端数据统一由生产网关接入）
          </p>
          {session && session.role !== 'super_admin' ? (
            <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[10px] font-medium text-sky-300">
              已授权 {session.permissions.length} 个模块
            </span>
          ) : (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-medium text-amber-400">
              超级管理员
            </span>
          )}
        </header>
        <main className="flex-1 overflow-auto bg-slate-950 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
