import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  PanelLeft,
  Search,
  Settings,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import type { AuthChangeEvent } from '@supabase/supabase-js'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { childActive, filterNavItemsForPlan, NAV_ITEMS, pathActive } from '../config/nav'
import { useMembership } from '../context/MembershipContext'
import { cn } from '../cn'
import AiAgentDrawer, { AiAgentFloatingButton } from './AiAgentDrawer'
import FloatingOnlineSupport from './FloatingOnlineSupport'
import TenantAnnouncementBell from './TenantAnnouncementBell'
import TenantUrgentAnnouncementModal from './TenantUrgentAnnouncementModal'
import { TenantAnnouncementProvider } from '../context/TenantAnnouncementContext'
import PartnerClientScopeBar from './PartnerClientScopeBar'
import OpsRegistryBridge from './OpsRegistryBridge'
import SupabaseChangePasswordForm from './SupabaseChangePasswordForm'
import { useAiAgent } from '../context/AiAgentContext'
import { fetchPrimaryTenantId, fetchTenantEnterpriseName } from '../lib/tenantBilling'
import { hydratePlatformBindingsFromCloud } from '../lib/merchantPlatformBindingHydrate'
import {
  clearTenantScopedBrowserState,
  maskCnPhone,
  phoneFromAuthUser,
  setActiveTenantStorageId,
} from '../lib/tenantLocalState'
import SiteIcpFooter from './SiteIcpFooter'
import { BRAND_LOGO_URL, BRAND_NAME } from '../lib/brand'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

export default function MeooLayout() {
  const location = useLocation()
  const pathname = location.pathname
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [openGroups, setOpenGroups] = useState<string[]>([])
  const [userOpen, setUserOpen] = useState(false)
  const [personalSettingsOpen, setPersonalSettingsOpen] = useState(false)
  const [personalSettingsFormKey, setPersonalSettingsFormKey] = useState(0)
  const [headerSearchQuery, setHeaderSearchQuery] = useState('')
  const { submitTopSearchQuery } = useAiAgent()
  const { plan } = useMembership()
  const navItems = useMemo(() => filterNavItemsForPlan(NAV_ITEMS, plan), [plan])
  const [adminName, setAdminName] = useState('管理员')
  const [enterpriseName, setEnterpriseName] = useState('')
  const [accountType] = useState('主账号')
  const [phone, setPhone] = useState('—')

  useEffect(() => {
    const client = supabase
    if (!supabaseConfigured || !client) return
    let lastUserId: string | null = null
    const apply = (event?: AuthChangeEvent) => {
      void (async () => {
        const {
          data: { session },
        } = await client.auth.getSession()
        const u = session?.user ?? null
        if (!u) {
          /** 仅明确登出时清本地态；Token 刷新间隙 session 为空不得误删绑定 */
          if (event === 'SIGNED_OUT' && lastUserId) {
            clearTenantScopedBrowserState()
          }
          if (event === 'SIGNED_OUT') {
            lastUserId = null
            setAdminName('管理员')
            setEnterpriseName('')
            setPhone('—')
          }
          return
        }
        if (lastUserId && lastUserId !== u.id) {
          clearTenantScopedBrowserState()
        }
        lastUserId = u.id
        const meta = u.user_metadata as { login_name?: string; phone?: string } | undefined
        setAdminName(meta?.login_name ?? u.email?.split('@')[0] ?? '用户')
        const mobile = phoneFromAuthUser({ phone: u.phone, user_metadata: meta })
        setPhone(mobile ? maskCnPhone(mobile) : '—')
        const tid = await fetchPrimaryTenantId(client)
        setActiveTenantStorageId(tid)
        if (tid) {
          const en = await fetchTenantEnterpriseName(client, tid)
          setEnterpriseName(en ?? '')
        } else {
          setEnterpriseName('')
        }
        await hydratePlatformBindingsFromCloud(client)
      })()
    }
    apply()
    const { data: sub } = client.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') return
      apply(event)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const defaultOpen = useMemo(() => {
    const paths: string[] = []
    for (const item of navItems) {
      if (!item.children) continue
      if (
        item.children.some((c) => childActive(pathname, c.path)) ||
        pathActive(pathname, item.path)
      ) {
        paths.push(item.path)
      }
    }
    return paths
  }, [pathname, navItems])

  useEffect(() => {
    setOpenGroups((prev) => {
      const merged = new Set([...prev, ...defaultOpen])
      return [...merged]
    })
  }, [defaultOpen])

  const toggleGroup = (path: string) => {
    setOpenGroups((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    )
  }

  /** 切换商户主账号 / 退出：清本地态、登出 Supabase，进入登录页（勿被 LoginPage 自动跳回首页） */
  const signOutAndGoLogin = (infoHint?: string) => {
    setUserOpen(false)
    void (async () => {
      clearTenantScopedBrowserState()
      if (supabaseConfigured && supabase) {
        await supabase.auth.signOut()
      }
      navigate('/login', {
        replace: true,
        state: { fromLogout: true, infoHint },
      })
    })()
  }

  const handleSwitchAccount = () => {
    signOutAndGoLogin('已退出当前账号，请输入其他商户账户名与密码登录')
  }

  const handleLogout = () => {
    signOutAndGoLogin()
  }

  const sidebarWidth = collapsed ? 'w-16' : 'w-64'
  const mainMargin = collapsed ? 'ml-16' : 'ml-64'

  return (
    <TenantAnnouncementProvider>
    <div className="flex min-h-screen bg-slate-100">
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 flex h-screen flex-shrink-0 flex-col border-r border-slate-800/90 bg-slate-950 shadow-[6px_0_32px_-12px_rgba(15,23,42,0.65)] transition-all duration-300',
          sidebarWidth,
        )}
      >
        <div className="flex h-16 items-center border-b border-slate-800/90 px-4">
          {!collapsed && (
            <>
              <img
                src={BRAND_LOGO_URL}
                alt={BRAND_NAME}
                className="mr-2 h-10 w-10 shrink-0 rounded-lg object-contain"
              />
              <span className="text-lg font-semibold tracking-tight text-white">{BRAND_NAME}</span>
            </>
          )}
          {collapsed && (
            <img
              src={BRAND_LOGO_URL}
              alt={BRAND_NAME}
              className="mx-auto h-9 w-9 rounded-lg object-contain"
            />
          )}
        </div>

        <nav className="h-[calc(100vh-4rem)] space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = item.children
              ? item.children.some((c) => childActive(pathname, c.path))
              : pathActive(pathname, item.path)

            if (item.children) {
              const open = openGroups.includes(item.path)
              return (
                <div key={item.path} className="relative">
                  <button
                    type="button"
                    onClick={() => !collapsed && toggleGroup(item.path)}
                    onMouseEnter={() => collapsed && setOpenGroups([item.path])}
                    onMouseLeave={() => collapsed && setOpenGroups([])}
                    className={cn(
                      'flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      collapsed ? 'justify-center' : 'justify-between',
                      active
                        ? 'bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-500/25'
                        : 'text-slate-300 hover:bg-slate-800/90 hover:text-white',
                    )}
                  >
                    <div className="flex items-center">
                      <Icon
                        className={cn(
                          'h-5 w-5',
                          !collapsed && 'mr-3',
                          active ? 'text-cyan-400' : 'text-slate-500',
                        )}
                      />
                      {!collapsed && item.label}
                    </div>
                    {!collapsed &&
                      (open ? (
                        <ChevronDown className="h-4 w-4 text-slate-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                      ))}
                  </button>

                  {open && !collapsed && (
                    <div className="ml-4 mt-1 space-y-1">
                      {item.children.map((c) => (
                        <NavLink
                          key={c.path}
                          to={c.path}
                          end={c.path === '/finance'}
                          className={({ isActive }) =>
                            cn(
                              'block rounded-lg px-3 py-2 text-sm transition-colors',
                              isActive
                                ? 'bg-cyan-500/15 font-medium text-cyan-100'
                                : 'text-slate-400 hover:bg-slate-800/80 hover:text-white',
                            )
                          }
                        >
                          {c.label}
                        </NavLink>
                      ))}
                    </div>
                  )}

                  {collapsed && open && (
                    <div className="absolute left-full top-0 z-50 ml-2 w-48 rounded-xl border border-slate-700 bg-slate-900 py-2 shadow-xl shadow-black/40">
                      <div className="border-b border-slate-800 px-3 py-2 text-xs font-medium text-slate-400">
                        {item.label}
                      </div>
                      {item.children.map((c) => (
                        <NavLink
                          key={c.path}
                          to={c.path}
                          end={c.path === '/finance'}
                          className={({ isActive }) =>
                            cn(
                              'block px-3 py-2 text-sm transition-colors',
                              isActive
                                ? 'bg-cyan-500/15 font-medium text-cyan-100'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                            )
                          }
                        >
                          {c.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    collapsed ? 'justify-center' : '',
                    isActive
                      ? 'bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-500/25'
                      : 'text-slate-300 hover:bg-slate-800/90 hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={cn(
                        'h-5 w-5',
                        !collapsed && 'mr-3',
                        isActive ? 'text-cyan-400' : 'text-slate-500',
                      )}
                    />
                    {!collapsed && item.label}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>
      </aside>

      <div className={cn('flex min-w-0 flex-1 flex-col transition-all duration-300', mainMargin)}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/90 bg-white/85 px-6 shadow-sm shadow-slate-900/[0.04] backdrop-blur-xl">
          <div className="flex flex-1 items-center">
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="mr-4 flex items-center justify-center rounded-xl p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              aria-label="折叠侧栏"
            >
              {collapsed ? (
                <Menu className="h-5 w-5" />
              ) : (
                <PanelLeft className="h-5 w-5" />
              )}
            </button>
            <div className="relative w-96 max-w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={headerSearchQuery}
                onChange={(e) => setHeaderSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    submitTopSearchQuery(headerSearchQuery)
                    setHeaderSearchQuery('')
                  }
                }}
                placeholder="搜索功能、数据，或输入 AI 指令..."
                className="w-full rounded-xl border border-slate-200/90 bg-slate-50/90 py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-cyan-400/60 focus:outline-none focus:ring-4 focus:ring-cyan-500/15"
              />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <PartnerClientScopeBar />
            <TenantAnnouncementBell />

            <div className="relative">
              <button
                type="button"
                onClick={() => setUserOpen((v) => !v)}
                className="flex items-center space-x-3 rounded-xl border-l border-slate-200/90 py-2 pl-4 pr-2 transition-colors hover:bg-slate-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 shadow-md shadow-cyan-900/20">
                  <User className="h-4 w-4 text-white" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium text-slate-800">{adminName}</span>
                  <span className="text-xs text-slate-500">
                    {accountType === '子账号' ? '子账号' : '主账号'}
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-slate-400 transition-transform',
                    userOpen && 'rotate-180',
                  )}
                />
              </button>

              <AnimatePresence>
                {userOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-slate-200/90 bg-white py-2 shadow-xl shadow-slate-900/10 ring-1 ring-slate-100"
                  >
                    <div className="border-b border-slate-100 px-4 py-3">
                      <div className="flex items-center space-x-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 shadow-md">
                          <User className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{adminName}</p>
                          <p className="text-xs text-slate-500">{phone}</p>
                        </div>
                      </div>
                    </div>
                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => void handleSwitchAccount()}
                        className="flex w-full items-center px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <Users className="mr-3 h-4 w-4 text-slate-400" />
                        切换账号
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                        onClick={() => {
                          setUserOpen(false)
                          navigate('/wallet')
                        }}
                      >
                        <Wallet className="mr-3 h-4 w-4 text-violet-500" />
                        我的钱包
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                        onClick={() => {
                          setUserOpen(false)
                          setPersonalSettingsFormKey((k) => k + 1)
                          setPersonalSettingsOpen(true)
                        }}
                      >
                        <Settings className="mr-3 h-4 w-4 text-slate-400" />
                        个人设置
                      </button>
                    </div>
                    <div className="border-t border-slate-100 py-1">
                      <button
                        type="button"
                        onClick={() => void handleLogout()}
                        className="flex w-full items-center px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50"
                      >
                        <LogOut className="mr-3 h-4 w-4" />
                        退出登录
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="erp-main erp-main-surface flex-1 overflow-auto p-6 lg:p-8">
          <Outlet />
        </main>

        <footer className="shrink-0 border-t border-slate-200/80 bg-white/80 px-6 py-3 backdrop-blur-sm">
          <SiteIcpFooter />
        </footer>
      </div>

      {personalSettingsOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="meoo-personal-settings-title"
          onClick={() => setPersonalSettingsOpen(false)}
        >
          <div
            className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl shadow-slate-900/15"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="meoo-personal-settings-title" className="text-lg font-semibold text-slate-900">
                个人设置
              </h2>
              <button
                type="button"
                onClick={() => setPersonalSettingsOpen(false)}
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {supabaseConfigured ? (
              <SupabaseChangePasswordForm key={personalSettingsFormKey} />
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <p className="font-medium">当前未启用云端登录</p>
                <p className="mt-1 text-amber-900/95">
                  请先由管理员在完成云端登录相关配置（服务地址与安全密钥），并重启 ERP
                  后，即可在此修改主账号登录密码。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPersonalSettingsOpen(false)
                    navigate({ pathname: '/settings', search: 'tab=accounts' })
                  }}
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
                >
                  前往系统设置
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <AiAgentDrawer />
      <div className="pointer-events-none fixed bottom-0 right-0 z-[60] flex flex-col items-center gap-3 p-4 sm:bottom-2 sm:right-2 sm:p-5">
        <div className="pointer-events-auto flex flex-col items-center gap-3">
          <AiAgentFloatingButton />
          <FloatingOnlineSupport customerId={adminName} enterpriseName={enterpriseName} />
        </div>
      </div>
      <OpsRegistryBridge />
      <TenantUrgentAnnouncementModal />
    </div>
    </TenantAnnouncementProvider>
  )
}
