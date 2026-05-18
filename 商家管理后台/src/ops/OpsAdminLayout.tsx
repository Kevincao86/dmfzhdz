import { Bot, Building2, CreditCard, Headphones, Shield, Smartphone, UserSearch } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { cn } from '../cn'
import { BRAND_LOGO_URL, BRAND_NAME } from '../lib/brand'

const OPS_NAV = [
  { to: '/customers', label: '客户管理', icon: Building2 },
  { to: '/payment-orders', label: '订单管理', icon: CreditCard },
  { to: '/accounts', label: '账号与权限', icon: Shield },
  { to: '/recruitment-orders', label: '商家达人招募订单', icon: UserSearch },
  { to: '/mp-recruitment-orders', label: '小程序达人招募订单', icon: Smartphone },
  { to: '/ai-models', label: 'AI 模型', icon: Bot },
  { to: '/support', label: '在线客服', icon: Headphones },
] as const

export default function OpsAdminLayout() {
  const { pathname } = useLocation()

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
          {OPS_NAV.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || pathname.startsWith(`${to}/`)
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
      </aside>

      <div className="ml-56 flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900/95 px-6 backdrop-blur">
          <p className="text-xs text-slate-500">
            客户全生命周期 · 账号权限 · 订单中枢 · AI 与客服对接（三端数据统一由生产网关接入）
          </p>
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-medium text-amber-400">
            演示 + dev 注册表
          </span>
        </header>
        <main className="flex-1 overflow-auto bg-slate-950 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
