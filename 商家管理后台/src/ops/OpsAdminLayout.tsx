import {
  Bot,
  Building2,
  Camera,
  Clapperboard,
  CreditCard,
  Headphones,
  LayoutDashboard,
  Library,
  LogOut,
  Megaphone,
  BookOpen,
  Shield,
  Smartphone,
  UserSearch,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
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
  indent?: boolean
}[] = [
  { to: '/', label: '首页', icon: LayoutDashboard, permission: 'home' },
  { to: '/customers', label: '客户管理', icon: Building2, permission: 'customers' },
  { to: '/announcements', label: '公告栏推送', icon: Megaphone, permission: 'announcements' },
  { to: '/payment-orders', label: '订单管理', icon: CreditCard, permission: 'payment_orders' },
  { to: '/accounts', label: '账号与权限', icon: Shield, permission: 'staff_admin' },
  { to: '/recruitment-orders', label: '商家达人招募订单', icon: UserSearch, permission: 'recruitment_orders' },
  { to: '/mp-recruitment-orders', label: '小程序达人招募订单', icon: Smartphone, permission: 'mp_recruitment_orders' },
  { to: '/talent-library', label: '灵祺达人库', icon: Library, permission: 'talent_library' },
  { to: '/shoot-team-library', label: '拍摄团队库', icon: Camera, permission: 'shoot_team_library', indent: true },
  { to: '/edit-team-library', label: '剪辑团队库', icon: Clapperboard, permission: 'edit_team_library', indent: true },
  { to: '/pr-library', label: 'PR 用户库', icon: Users, permission: 'pr_library' },
  { to: '/ai-models', label: 'AI 模型', icon: Bot, permission: 'ai_models' },
  { to: '/support', label: '在线客服（ERP处理中心）', icon: Headphones, permission: 'support' },
  {
    to: '/support-mp',
    label: '在线客服（小程序达人、PR处理中心）',
    icon: Headphones,
    permission: 'support_mp',
  },
  { to: '/help-manual', label: '帮助手册 · 商家版', icon: BookOpen, permission: 'help_manual' },
  { to: '/help-manual/partner', label: '服务商版', icon: BookOpen, permission: 'help_manual', indent: true },
  { to: '/help-manual/fulfillment', label: '履约平台', icon: BookOpen, permission: 'help_manual', indent: true },
  { to: '/team-intro', label: '团队介绍', icon: Users, permission: 'team_intro' },
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
    <div className="ops-shell flex min-h-screen">
      <aside className="ops-sidebar fixed left-0 top-0 z-40 flex h-screen w-56 flex-col border-r">
        <div className="flex h-16 items-center gap-2 border-b border-[var(--ops-border)] px-4">
          <img src={BRAND_LOGO_URL} alt={BRAND_NAME} className="h-9 w-9 shrink-0 rounded-lg object-contain" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">运营管控台</div>
            <div className="ops-muted truncate text-[10px]">{BRAND_NAME}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {visibleNav.map(({ to, label, icon: Icon, indent }) => {
            const active =
              to === '/'
                ? pathname === '/' || pathname === ''
                : pathname === to || pathname.startsWith(`${to}/`)
            return (
              <NavLink
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg py-2.5 text-sm font-medium transition-colors',
                  indent ? 'pl-7 pr-3 text-[13px]' : 'px-3',
                  active
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-[var(--ops-muted)] hover:bg-[var(--ops-hover)] hover:text-[var(--ops-text)]',
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-90" />
                {label}
              </NavLink>
            )
          })}
        </nav>
        {session ? (
          <div className="border-t border-[var(--ops-border)] p-3">
            <p className="truncate text-xs font-medium">{session.displayName}</p>
            <p className="ops-muted truncate font-mono text-[10px]">{session.phone}</p>
            <p className="mt-0.5 text-[10px] text-indigo-500">
              {session.role === 'super_admin' ? '超级管理员' : '运营子账号'}
            </p>
            <ThemeToggle />
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--ops-border)] py-1.5 text-xs text-[var(--ops-muted)] hover:bg-[var(--ops-hover)]"
            >
              <LogOut className="h-3.5 w-3.5" />
              退出登录
            </button>
          </div>
        ) : null}
      </aside>

      <div className="ml-56 flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="ops-header sticky top-0 z-30 flex h-14 items-center justify-between border-b px-6 backdrop-blur">
          <p className="ops-muted text-xs">
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
        <main className="ops-shell flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
