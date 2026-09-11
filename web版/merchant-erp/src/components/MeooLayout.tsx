import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  PanelLeft,
  Search,
  Settings,
  Share2,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import type { AuthChangeEvent } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  buildSimpleNavItems,
  childActive,
  filterNavItemsForPartnerEdition,
  filterNavItemsForPlan,
  NAV_ITEMS,
  pathActive,
  readMerchantUiDensity,
  writeMerchantUiDensity,
  type MerchantUiDensity,
  type MerchantUiOutletContext,
} from '../config/nav'
import { isPartnerEdition } from '../lib/appEdition'
import { usePartnerTenant } from '../context/PartnerTenantContext'
import { ensurePartnerXingxuanBootstrap } from '../lib/partnerXingxuanBootstrapClient'
import { useMembership } from '../context/MembershipContext'
import { cn } from '../cn'
import AiAgentDrawer, { AiAgentFloatingButton } from './AiAgentDrawer'
import AiGenerationJobsBanner from './AiGenerationJobsBanner'
import FloatingOnlineSupport from './FloatingOnlineSupport'
import TenantAnnouncementBell from './TenantAnnouncementBell'
import TenantUrgentAnnouncementModal from './TenantUrgentAnnouncementModal'
import PlatformDecorHomeHost from './PlatformDecorHomeHost'
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
  getActiveTenantStorageId,
  setActiveTenantStorageId,
} from '../lib/tenantLocalState'
import SiteIcpFooter from './SiteIcpFooter'
import { BRAND_LOGO_URL, BRAND_NAME, BRAND_NAME_SHORT } from '../lib/brand'
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
  const { profile } = usePartnerTenant()
  const [uiDensity, setUiDensityState] = useState<MerchantUiDensity>(() =>
    isPartnerEdition() ? 'detailed' : readMerchantUiDensity(getActiveTenantStorageId()),
  )
  const setUiDensity = useCallback((density: MerchantUiDensity) => {
    if (isPartnerEdition()) return
    writeMerchantUiDensity(density, getActiveTenantStorageId())
    setUiDensityState(density)
  }, [])
  useEffect(() => {
    if (isPartnerEdition()) return
    const sync = () => setUiDensityState(readMerchantUiDensity(getActiveTenantStorageId()))
    window.addEventListener('meoo-active-tenant-changed', sync)
    return () => window.removeEventListener('meoo-active-tenant-changed', sync)
  }, [])
  const navItems = useMemo(() => {
    const forPlan = filterNavItemsForPlan(NAV_ITEMS, plan)
    const base = isPartnerEdition()
      ? filterNavItemsForPartnerEdition(forPlan, { isParent: profile.isParent })
      : forPlan
    if (isPartnerEdition() || uiDensity === 'detailed') return base
    return buildSimpleNavItems(base)
  }, [plan, profile.isParent, uiDensity])
  const outletContext = useMemo<MerchantUiOutletContext>(
    () => ({ uiDensity: isPartnerEdition() ? 'detailed' : uiDensity, setUiDensity }),
    [uiDensity, setUiDensity],
  )
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
        if (isPartnerEdition()) void ensurePartnerXingxuanBootstrap()
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
      // 有子菜单时只按子项匹配展开，避免父 path 前缀误开其它组（如 /operation vs AI 创作）
      if (item.children.some((c) => childActive(pathname, c.path))) {
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
    <div className="flex min-h-screen bg-[#e8eaed]">
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 flex h-screen flex-shrink-0 flex-col border-r border-black/20 bg-[#1c1814] transition-all duration-300',
          sidebarWidth,
        )}
      >
        <div className="flex h-16 items-center border-b border-[rgba(201,162,39,0.28)] px-4">
          {!collapsed && (
            <>
              <img
                src={BRAND_LOGO_URL}
                alt={BRAND_NAME}
                className="mr-2 h-9 w-9 shrink-0 object-contain"
              />
              <span className="font-[family-name:var(--lq-serif)] text-base tracking-[0.12em] text-[#c9a227]">
                {BRAND_NAME_SHORT}商家
              </span>
            </>
          )}
          {collapsed && (
            <img
              src={BRAND_LOGO_URL}
              alt={BRAND_NAME}
              className="mx-auto h-9 w-9 object-contain"
            />
          )}
        </div>

        <nav className="h-[calc(100vh-4rem)] space-y-0.5 overflow-y-auto p-2">
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
                      'flex w-full items-center border-l-2 px-3 py-2.5 text-sm font-medium',
                      collapsed ? 'justify-center' : 'justify-between',
                      active
                        ? 'border-[#c9a227] bg-white/[0.06] text-[#f4efe6]'
                        : 'border-transparent text-white/55 hover:bg-white/[0.04] hover:text-[#f4efe6]',
                    )}
                  >
                    <div className="flex items-center">
                      <Icon
                        className={cn(
                          'h-5 w-5',
                          !collapsed && 'mr-3',
                          active ? 'text-[#c9a227]' : 'text-white/35',
                        )}
                      />
                      {!collapsed && item.label}
                    </div>
                    {!collapsed &&
                      (open ? (
                        <ChevronDown className="h-4 w-4 text-white/35" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-white/35" />
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
                                ? 'bg-[rgba(180,35,24,0.18)] font-medium text-[#f4efe6]'
                                : 'text-white/40 hover:bg-white/[0.04] hover:text-[#f4efe6]',
                            )
                          }
                        >
                          {c.label}
                        </NavLink>
                      ))}
                    </div>
                  )}

                  {collapsed && open && (
                    <div className="absolute left-full top-0 z-50 ml-2 w-48 border border-[#c9a227]/30 bg-[#1c1814] py-2">
                      <div className="border-b border-white/10 px-3 py-2 text-xs font-medium text-[#c9a227]">
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
                                ? 'bg-[rgba(180,35,24,0.18)] font-medium text-[#f4efe6]'
                                : 'text-white/40 hover:bg-white/[0.06] hover:text-[#f4efe6]',
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
                    'flex items-center border-l-2 px-3 py-2.5 text-sm font-medium',
                    collapsed ? 'justify-center' : '',
                    isActive
                      ? 'border-[#c9a227] bg-white/[0.06] text-[#f4efe6]'
                      : 'border-transparent text-white/55 hover:bg-white/[0.04] hover:text-[#f4efe6]',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={cn(
                        'h-5 w-5',
                        !collapsed && 'mr-3',
                        isActive ? 'text-[#c9a227]' : 'text-white/35',
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
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#d4d0c8] bg-[#fffdf9] px-6">
          <div className="flex flex-1 items-center">
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="mr-4 flex items-center justify-center p-2 text-[#3f3a35] transition-colors hover:bg-[#f4efe6] hover:text-[#b42318]"
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
                className="w-full rounded-[2px] border border-[#d4d0c8] bg-[#f4efe6] py-2.5 pl-10 pr-4 text-sm text-[#16141a] placeholder:text-[#6b6560] focus:border-[#b42318] focus:outline-none focus:ring-2 focus:ring-[rgba(180,35,24,0.16)]"
              />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <PartnerClientScopeBar />
            {!isPartnerEdition() ? (
              <div
                className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium text-slate-600"
                role="group"
                aria-label="界面版本"
              >
                <button
                  type="button"
                  aria-pressed={uiDensity === 'simple'}
                  onClick={() => setUiDensity('simple')}
                  className={cn(
                    'rounded-md px-2 py-1 transition-colors',
                    uiDensity === 'simple'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'hover:text-slate-800',
                  )}
                >
                  精简
                </button>
                <button
                  type="button"
                  aria-pressed={uiDensity === 'detailed'}
                  onClick={() => setUiDensity('detailed')}
                  className={cn(
                    'rounded-md px-2 py-1 transition-colors',
                    uiDensity === 'detailed'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'hover:text-slate-800',
                  )}
                >
                  详细
                </button>
              </div>
            ) : null}
            <TenantAnnouncementBell />

            <div className="relative">
              <button
                type="button"
                onClick={() => setUserOpen((v) => !v)}
                className="flex items-center space-x-3 rounded-xl border-l border-slate-200/90 py-2 pl-4 pr-2 transition-colors hover:bg-slate-50"
              >
                <div className="flex h-8 w-8 items-center justify-center bg-[#b42318]">
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
                        <div className="flex h-10 w-10 items-center justify-center bg-[#b42318]">
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
                      {!isPartnerEdition() ? (
                        <button
                          type="button"
                          className="flex w-full items-center px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                          onClick={() => {
                            setUserOpen(false)
                            navigate('/affiliate/portal')
                          }}
                        >
                          <Share2 className="mr-3 h-4 w-4 text-violet-500" />
                          我的推广
                        </button>
                      ) : null}
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
                        修改密码
                      </button>
                      {!isPartnerEdition() ? (
                        <button
                          type="button"
                          className="flex w-full items-center px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                          onClick={() => {
                            setUiDensity(uiDensity === 'simple' ? 'detailed' : 'simple')
                            setUserOpen(false)
                          }}
                        >
                          <PanelLeft className="mr-3 h-4 w-4 text-slate-400" />
                          {uiDensity === 'simple' ? '切换为详细版' : '切换为精简版'}
                        </button>
                      ) : null}
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

        <main className="erp-main erp-main-surface flex-1 overflow-auto p-5 lg:p-8">
          <div className="mx-auto w-full max-w-[1400px]">
            <PlatformDecorHomeHost />
            <Outlet context={outletContext} />
          </div>
        </main>

        <footer className="shrink-0 border-t border-[#d4d0c8] bg-[#fffdf9] px-6 py-3">
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
            className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-[2px] border border-[#d4d0c8] bg-[#fffdf9] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="meoo-personal-settings-title" className="text-lg font-semibold text-slate-900">
                修改密码
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
                  className="mt-4 w-full rounded-[2px] bg-[#16141a] py-2.5 text-sm font-medium text-white transition hover:bg-[#1c1814]"
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
          <AiGenerationJobsBanner />
          <FloatingOnlineSupport customerId={adminName} enterpriseName={enterpriseName} />
        </div>
      </div>
      <OpsRegistryBridge />
      <TenantUrgentAnnouncementModal />
      {/* 活动海报弹层在 PlatformDecorHomeHost 内，与紧急公告互斥 */}
    </div>
    </TenantAnnouncementProvider>
  )
}
