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
import AccountIdentityBindPanel from './AccountIdentityBindPanel'
import AuthBindContactModal from './login/AuthBindContactModal'
import { postAuthIdentity } from '../lib/tenantRegisterApi'
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
import { BRAND_LOGO_URL, BRAND_NAME } from '../lib/brand'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

export default function MeooLayout() {
  const location = useLocation()
  const pathname = location.pathname
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
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
  const [needPhoneBind, setNeedPhoneBind] = useState(false)
  const [bindAccessToken, setBindAccessToken] = useState('')

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
            setNeedPhoneBind(false)
            setBindAccessToken('')
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
        const tok = session.access_token
        setBindAccessToken(tok || '')
        if (tok) {
          const idn = await postAuthIdentity({ action: 'identities', access_token: tok })
          setNeedPhoneBind(Boolean(idn.needsPhoneBind))
        } else {
          setNeedPhoneBind(!mobile)
        }
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

  const activeGroup = navItems.find(
    (item) => item.children?.some((c) => childActive(pathname, c.path)),
  )

  const navLinkClass = (active: boolean) =>
    cn(
      'relative shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
      active ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white',
    )

  return (
    <TenantAnnouncementProvider>
    <div className="flex min-h-screen flex-col bg-[#E8EEF4] text-[#14181F]">
      <header className="erp-header-bar sticky top-0 z-40 bg-[#1E3A5F] text-white shadow-sm">
        <div className="flex h-12 items-center gap-3 px-3 lg:px-5">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10 lg:hidden"
            aria-label="打开菜单"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <NavLink to="/home" className="flex shrink-0 items-center gap-2">
            <img
              src={BRAND_LOGO_URL}
              alt={BRAND_NAME}
              className="h-8 w-8 rounded-lg object-contain ring-1 ring-white/25"
            />
            <span className="hidden text-[15px] font-semibold tracking-tight text-white sm:inline">
              {BRAND_NAME}
            </span>
          </NavLink>

          <nav className="hidden min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-visible lg:flex">
            {navItems.map((item) => {
              const active = item.children
                ? item.children.some((c) => childActive(pathname, c.path))
                : pathActive(pathname, item.path)
              const href = item.children?.[0]?.path ?? item.path
              return (
                <NavLink
                  key={item.path}
                  to={href}
                  end={!item.children && item.path === '/home'}
                  className={navLinkClass(active)}
                >
                  {item.label}
                </NavLink>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="relative hidden w-52 xl:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/70" />
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
                placeholder="问灵祺…"
                className="w-full rounded-md border border-white/25 bg-white/15 py-1.5 pl-8 pr-3 text-sm text-white placeholder:text-white/60 focus:border-white/50 focus:outline-none focus:ring-2 focus:ring-white/25"
              />
            </div>
            <PartnerClientScopeBar />
            {!isPartnerEdition() ? (
              <div
                className="hidden items-center rounded-md border border-white/25 bg-white/10 p-0.5 text-xs font-medium text-white/80 md:flex"
                role="group"
                aria-label="界面版本"
              >
                <button
                  type="button"
                  aria-pressed={uiDensity === 'simple'}
                  onClick={() => setUiDensity('simple')}
                  className={cn(
                    'rounded px-2 py-1 transition-colors',
                    uiDensity === 'simple' ? 'bg-white text-[#1E3A5F]' : 'hover:text-white',
                  )}
                >
                  精简
                </button>
                <button
                  type="button"
                  aria-pressed={uiDensity === 'detailed'}
                  onClick={() => setUiDensity('detailed')}
                  className={cn(
                    'rounded px-2 py-1 transition-colors',
                    uiDensity === 'detailed' ? 'bg-white text-[#1E3A5F]' : 'hover:text-white',
                  )}
                >
                  详细
                </button>
              </div>
            ) : null}
            <div className="[&>div>button]:text-white [&>div>button:hover]:bg-white/10 [&>div>button:hover]:text-white">
              <TenantAnnouncementBell />
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setUserOpen((v) => !v)}
                className="flex items-center space-x-3 rounded-lg py-1 pl-2 pr-1 transition-colors hover:bg-white/10"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                  <User className="h-4 w-4 text-white" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium text-white">{adminName}</span>
                  <span className="text-xs text-white/70">
                    {accountType === '子账号' ? '子账号' : '主账号'}
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-white/70 transition-transform',
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
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1E3A5F]">
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
                        个人中心
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
        </div>

        {activeGroup?.children?.length ? (
          <div className="erp-header-subnav hidden items-center gap-1 overflow-visible bg-[#DCE5F0] px-5 py-1.5 text-[#14181F] lg:flex">
            {activeGroup.children.map((c) => (
              <NavLink
                key={c.path}
                to={c.path}
                end={c.path === '/finance'}
                className={({ isActive }) =>
                  cn(
                    'shrink-0 rounded-md px-2.5 py-1 text-[13px]',
                    isActive
                      ? 'bg-white font-medium text-[#1E3A5F] shadow-sm'
                      : 'text-[#3d4450] hover:bg-white/70 hover:text-[#14181F]',
                  )
                }
              >
                {c.label}
              </NavLink>
            ))}
          </div>
        ) : null}
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#14181F]/40"
            aria-label="关闭菜单"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(88vw,20rem)] flex-col bg-[#F2F3F0] shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-[#D5D9DE] px-4">
              <span className="text-sm font-semibold">{BRAND_NAME}</span>
              <button
                type="button"
                className="rounded-lg p-2 text-[#3d4450]"
                aria-label="关闭"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3">
              {navItems.map((item) => {
                const open = openGroups.includes(item.path)
                if (item.children) {
                  return (
                    <div key={item.path} className="mb-1">
                      <button
                        type="button"
                        onClick={() => toggleGroup(item.path)}
                        className="flex w-full items-center justify-between px-2 py-2 text-sm font-medium text-[#14181F]"
                      >
                        {item.label}
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      {open
                        ? item.children.map((c) => (
                            <NavLink
                              key={c.path}
                              to={c.path}
                              end={c.path === '/finance'}
                              onClick={() => setMobileOpen(false)}
                              className={({ isActive }) =>
                                cn(
                                  'block px-4 py-1.5 text-sm',
                                  isActive ? 'text-[#1E3A5F]' : 'text-[#3d4450]',
                                )
                              }
                            >
                              {c.label}
                            </NavLink>
                          ))
                        : null}
                    </div>
                  )
                }
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn('block px-2 py-2 text-sm', isActive ? 'font-medium text-[#1E3A5F]' : 'text-[#14181F]')
                    }
                  >
                    {item.label}
                  </NavLink>
                )
              })}
            </nav>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="erp-main erp-main-surface flex-1 overflow-auto p-4 pr-12 lg:py-4 lg:pl-5 lg:pr-12">
          <div className="erp-content-plate mx-auto w-full max-w-[1400px]">
            <PlatformDecorHomeHost />
            <Outlet context={outletContext} />
          </div>
        </main>

        <footer className="shrink-0 bg-[#E8EEF4] px-6 pb-6 pt-3">
          <div className="mx-auto flex max-w-[1400px] flex-col items-center gap-1.5">
            <p className="flex flex-wrap justify-center gap-x-4 text-xs text-slate-400">
              <NavLink to="/help" className="transition-colors hover:text-slate-600">
                帮助手册
              </NavLink>
              <NavLink to="/team" className="transition-colors hover:text-slate-600">
                关于我们
              </NavLink>
              <NavLink to="/legal/privacy" className="transition-colors hover:text-slate-600">
                隐私政策
              </NavLink>
            </p>
            <SiteIcpFooter />
          </div>
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
                个人中心
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
              <>
                <AccountIdentityBindPanel />
                <div className="mt-6 border-t border-slate-100 pt-5">
                  <p className="mb-3 text-sm font-semibold text-slate-800">修改密码</p>
                  <SupabaseChangePasswordForm key={personalSettingsFormKey} />
                </div>
              </>
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

      <AuthBindContactModal
        open={needPhoneBind}
        accessToken={bindAccessToken}
        onBound={() => setNeedPhoneBind(false)}
      />

      <AiAgentDrawer />
      <div className="pointer-events-none fixed right-0 top-[68%] z-[60] -translate-y-1/2">
        <div className="pointer-events-auto mb-2 mr-2 flex justify-end">
          <AiGenerationJobsBanner />
        </div>
        <div className="pointer-events-auto flex flex-col">
          <AiAgentFloatingButton />
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
