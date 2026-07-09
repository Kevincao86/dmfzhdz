import {
  Building2,
  CalendarDays,
  Coins,
  Crown,
  Link2,
  Megaphone,
  ScanLine,
  Shield,
  Store,
  Users,
  UserCircle2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '../cn'
import SubscriptionPlansPanel from '../components/SubscriptionPlansPanel'
import TenantPayModal from '../components/TenantPayModal'
import {
  computeMemberUsageRemaining,
  fetchTenantSubscriptionSnapshot,
} from '../lib/tenantBilling'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import AiModelBindingSection from './settings/AiModelBindingSection'
import DouyinMerchantSection from './settings/DouyinMerchantSection'
import KuaishouMerchantSection from './settings/KuaishouMerchantSection'
import OceanEngineWorkbenchSection from './settings/OceanEngineWorkbenchSection'
import XhsCommercialSection from './settings/XhsCommercialSection'
import MeituanMerchantSection from './settings/MeituanMerchantSection'
import SubAccountPermissionsPanel from './settings/SubAccountPermissionsPanel'
import SubAccountsPanel from './settings/SubAccountsPanel'
import XhsMerchantSection from './settings/XhsMerchantSection'
import WaimaiMerchantSection from './settings/WaimaiMerchantSection'
import PlatformConnectionsPanel from './settings/PlatformConnectionsPanel'
import {
  MERCHANT_BACKEND_PLATFORMS,
  PlatformBrandLogo,
  WAIMAI_BACKEND_PLATFORMS,
  type MerchantBackendPlatformId,
  type WaimaiBackendPlatformId,
} from '../lib/platformBranding'
import {
  ELEME_BIND_GUIDE_STEPS,
  JD_WAIMAI_BIND_GUIDE_STEPS,
  MEITUAN_WAIMAI_BIND_GUIDE_STEPS,
} from './settings/bindGuide/waimaiBindGuides'
import { useMembership } from '../context/MembershipContext'
import { editionLabel, isPartnerEdition } from '../lib/appEdition'
import { isPartnerSupportedGroupbuyPlatform } from '../lib/partnerPlatformCopy'
import { formatErpPointsEquivalentsLine } from '../lib/erpPointsEconomics'
import {
  fetchTenantBillingSummary,
  type TenantBillingSummary,
} from '../services/tenantBillingClient'
import PartnerClientsSection from './settings/PartnerClientsSection'
import PartnerAgentManagementSection from './settings/PartnerAgentManagementSection'
import PartnerEntitlementSection from './settings/PartnerEntitlementSection'
import { usePartnerTenant } from '../context/PartnerTenantContext'

type VerifyItem = {
  id: string
  name: string
  icon: string
  status: 'connected' | 'disconnected'
  connectedAt?: string
}

/** 与线上 bundle 中核销系统列表 `je` 初始配置一致 */
const VERIFY_INITIAL: VerifyItem[] = [
  { id: 'meituan_saas', name: '美团Saas', icon: 'fa-solid fa-utensils', status: 'disconnected' },
  { id: 'keruyun', name: '客如云', icon: 'fa-solid fa-cloud', status: 'disconnected' },
  { id: 'yinbao', name: '银豹', icon: 'fa-solid fa-paw', status: 'disconnected' },
  { id: 'maituan', name: '迈团', icon: 'fa-solid fa-store', status: 'disconnected' },
  { id: 'other', name: '其他核销系统', icon: 'fa-solid fa-credit-card', status: 'disconnected' },
]

/** 恢复「核销系统」页签与对接区块时改为 true */
const SHOW_VERIFY_SYSTEM_TAB = false

const MERCHANT_TABS = [
  { id: 'platforms' as const, label: '平台连接', icon: Link2 },
  { id: 'commercial' as const, label: '商业化后台', icon: Megaphone },
  { id: 'verify' as const, label: '核销系统', icon: ScanLine },
  { id: 'merchant' as const, label: '商家版后台', icon: Store },
  { id: 'accounts' as const, label: '账号管理', icon: Users },
  { id: 'permissions' as const, label: '权限设置', icon: Shield },
  { id: 'subscription' as const, label: '订阅', icon: CalendarDays },
] as const

const PARTNER_TABS_PARENT = [
  { id: 'platforms' as const, label: '平台连接', icon: Link2 },
  { id: 'commercial' as const, label: '商业化后台', icon: Megaphone },
  { id: 'merchant' as const, label: '服务商平台', icon: Store },
  { id: 'partner_clients' as const, label: '客户商家', icon: UserCircle2 },
  { id: 'partner_agents' as const, label: '代理管理', icon: Building2 },
  { id: 'partner_entitlements' as const, label: '权益分配', icon: Coins },
  { id: 'accounts' as const, label: '账号管理', icon: Users },
  { id: 'permissions' as const, label: '权限设置', icon: Shield },
  { id: 'subscription' as const, label: '订阅', icon: CalendarDays },
] as const

const PARTNER_TABS_AGENT = [
  { id: 'platforms' as const, label: '平台连接', icon: Link2 },
  { id: 'commercial' as const, label: '商业化后台', icon: Megaphone },
  { id: 'partner_clients' as const, label: '客户商家', icon: UserCircle2 },
  { id: 'partner_entitlements' as const, label: '我的权益', icon: Coins },
  { id: 'accounts' as const, label: '账号管理', icon: Users },
  { id: 'permissions' as const, label: '权限设置', icon: Shield },
  { id: 'subscription' as const, label: '订阅', icon: CalendarDays },
] as const

type MerchantTabId = (typeof MERCHANT_TABS)[number]['id']
type PartnerParentTabId = (typeof PARTNER_TABS_PARENT)[number]['id']
type PartnerAgentTabId = (typeof PARTNER_TABS_AGENT)[number]['id']
type SettingsTabId = MerchantTabId | PartnerParentTabId | PartnerAgentTabId

const MERCHANT_BACKEND_COMING_SOON_MSG = '功能即将开放，敬请期待。'

function formatCnDate(d: Date) {
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export default function SettingsPage() {
  const location = useLocation()
  const { plan, entitlements, reload: reloadMembership } = useMembership()
  const { profile } = usePartnerTenant()
  const partnerEdition = isPartnerEdition()
  const tabs = useMemo(() => {
    const base = partnerEdition
      ? profile.isAgent
        ? [...PARTNER_TABS_AGENT]
        : [...PARTNER_TABS_PARENT]
      : [...MERCHANT_TABS]
    return SHOW_VERIFY_SYSTEM_TAB ? base : base.filter((t) => t.id !== 'verify')
  }, [partnerEdition, profile.isAgent])
  const tabIds = useMemo(() => new Set(tabs.map((t) => t.id)), [tabs])
  const [tab, setTab] = useState<SettingsTabId>('platforms')
  const [merchantPlat, setMerchantPlat] = useState<MerchantBackendPlatformId>('douyin')
  const [waimaiPlat, setWaimaiPlat] = useState<WaimaiBackendPlatformId>('eleme')
  const [verifyList, setVerifyList] = useState<VerifyItem[]>(VERIFY_INITIAL)
  const [subModalOpen, setSubModalOpen] = useState(false)
  const [subTierIndex, setSubTierIndex] = useState(0)
  const [billingSummary, setBillingSummary] = useState<TenantBillingSummary | null | undefined>(undefined)
  const [subSnap, setSubSnap] = useState<
    | undefined
    | {
        serviceExpireAt: string | null
        subscriptionDays: number
        opsGiftDays: number
      }
  >(undefined)

  const loadOfficialBilling = useCallback(async () => {
    if (!supabaseConfigured || !supabase) {
      setSubSnap(undefined)
      setBillingSummary(undefined)
      return
    }
    try {
      const snap = await fetchTenantSubscriptionSnapshot(supabase)
      setSubSnap({
        serviceExpireAt: snap.serviceExpireAt,
        subscriptionDays: snap.subscriptionDays ?? 0,
        opsGiftDays: snap.opsGiftDays ?? 0,
      })
      try {
        const summary = await fetchTenantBillingSummary()
        setBillingSummary(summary)
      } catch {
        setBillingSummary(null)
      }
    } catch {
      setSubSnap({
        serviceExpireAt: null,
        subscriptionDays: 0,
        opsGiftDays: 0,
      })
      setBillingSummary(null)
    }
  }, [])

  const closeSubModal = () => {
    setSubModalOpen(false)
    void loadOfficialBilling()
    void reloadMembership({ silent: true })
  }

  const openSubModal = (tierIndex = 0) => {
    setSubTierIndex(tierIndex)
    setSubModalOpen(true)
  }

  const refreshAfterPay = () => {
    void loadOfficialBilling()
    void reloadMembership({ silent: true })
  }

  const isPaidMember = plan === 'member' || plan === 'member_plus'
  const memberUsage = useMemo(
    () => computeMemberUsageRemaining(subSnap?.serviceExpireAt ?? null),
    [subSnap?.serviceExpireAt],
  )

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setSubSnap(undefined)
      return
    }
    const sb = supabase
    let cancelled = false
    const run = async () => {
      try {
        const snap = await fetchTenantSubscriptionSnapshot(sb)
        if (cancelled) return
        setSubSnap({
          serviceExpireAt: snap.serviceExpireAt,
          subscriptionDays: snap.subscriptionDays ?? 0,
          opsGiftDays: snap.opsGiftDays ?? 0,
        })
      } catch {
        if (!cancelled) {
          setSubSnap({ serviceExpireAt: null, subscriptionDays: 0, opsGiftDays: 0 })
        }
      }
    }
    void run()
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(() => {
      void run()
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabaseConfigured, supabase, tab])

  /** 地址栏 ?tab= / ?upgrade=1 / OAuth 回调 auth_code：同步页签 */
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    const ts = p.get('tab')
    if (p.get('auth_code') || p.get('code')) {
      setTab('commercial')
    } else if (p.get('upgrade') === '1') {
      setTab('subscription')
    } else if (ts && tabIds.has(ts as SettingsTabId)) {
      setTab(ts as SettingsTabId)
    }
  }, [location.search, tabIds])

  useEffect(() => {
    if (tab === 'subscription') void reloadMembership({ silent: true })
  }, [tab, reloadMembership])

  const toggleVerify = (id: string) => {
    setVerifyList((list) =>
      list.map((item) => {
        if (item.id !== id) return item
        if (item.status === 'connected') {
          return { ...item, status: 'disconnected', connectedAt: undefined }
        }
        return {
          ...item,
          status: 'connected',
          connectedAt: new Date().toLocaleString('zh-CN'),
        }
      }),
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="relative pl-4">
        <span className="absolute left-0 top-1 h-[calc(100%-4px)] w-1 rounded-full bg-gradient-to-b from-cyan-500 to-teal-500" aria-hidden />
        <h1 className="erp-page-title">系统设置</h1>
        <p className="mt-1.5 text-sm text-slate-600">
          {isPartnerEdition()
            ? `${editionLabel()}：绑定服务商身份、代运营客户商家账号、账号权限与订阅`
            : '管理平台连接、商业化投放、商家后台、账号权限与订阅'}
        </p>
      </div>

      <TenantPayModal
        open={subModalOpen}
        title="订阅灵祺 ERP"
        mode="subscription"
        initialTierIndex={subTierIndex}
        walletBalanceCents={billingSummary?.walletBalanceCents}
        onClose={closeSubModal}
        onPaid={refreshAfterPay}
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/60">
          <nav className="flex flex-wrap gap-0.5 px-2 py-1 sm:px-3">
            {tabs.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id as SettingsTabId)}
                  className={cn(
                    'flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors sm:px-4',
                    tab === t.id
                      ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200/80'
                      : 'text-slate-600 hover:bg-white/70 hover:text-slate-900',
                  )}
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0" />
                  {t.label}
                </button>
              )
            })}
          </nav>
        </div>

        <div className="p-6 sm:p-8">
          {tab === 'platforms' && (
            <div className="space-y-8">
              <PlatformConnectionsPanel />

              <AiModelBindingSection />
            </div>
          )}

          {tab === 'commercial' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">商业化后台</h3>
                <p className="mt-1 text-sm text-gray-500">
                  绑定投流与线索所用账号：巨量工作台（本地推 / 千川）、小红书聚光 · 种小草。与「商家版后台」店铺经营授权相互独立。
                </p>
              </div>
              <OceanEngineWorkbenchSection />
              <XhsCommercialSection />
            </div>
          )}

          {tab === 'subscription' && (
            <div className="space-y-8">
              {partnerEdition && profile.isAgent ? (
                <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-4 text-sm text-violet-950">
                  <p className="font-medium">订阅由总代管理</p>
                  <p className="mt-2">席位与积分由总代在「权益分配」中划拨；续费请联系总代。</p>
                </div>
              ) : (
                <>
              {billingSummary ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">AI 积分余额</p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
                      {billingSummary.totalPoints.toLocaleString('zh-CN')}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      套餐桶 {billingSummary.packagePoints.toLocaleString('zh-CN')} · 充值桶{' '}
                      {billingSummary.rechargePoints.toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">会员剩余</p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
                      {billingSummary.remainDays != null && billingSummary.remainDays > 0
                        ? billingSummary.remainDays
                        : 0}{' '}
                      <span className="text-lg font-medium text-slate-500">天</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      月赠 {billingSummary.monthlyGiftPoints.toLocaleString('zh-CN')} 积分
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">钱包余额</p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
                      ¥{(billingSummary.walletBalanceCents / 100).toFixed(2)}
                    </p>
                    <a href="/wallet" className="mt-2 inline-block text-xs font-medium text-indigo-600 hover:underline">
                      前往我的钱包 →
                    </a>
                  </div>
                </div>
              ) : null}

              <SubscriptionPlansPanel
                currentPlan={plan}
                onSelectPlan={(tierIndex) => openSubModal(tierIndex)}
              />

              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5">
                <div className="mb-2 flex items-center text-slate-900">
                  <Crown className="mr-2 h-5 w-5 text-amber-500" />
                  <span className="font-semibold">当前订阅状态</span>
                </div>
                <p className="text-sm text-slate-600">
                  当前版本：<strong className="text-slate-900">{entitlements.planLabel}</strong>
                  {billingSummary ? (
                    <span className="ml-2 text-slate-500">
                      · 积分 {formatErpPointsEquivalentsLine(billingSummary.totalPoints)}
                    </span>
                  ) : null}
                </p>
                {subSnap && isPaidMember ? (
                  <div className="mt-3 space-y-1 text-sm text-slate-700">
                    <p>
                      订阅 {subSnap.subscriptionDays} 天 + 赠送 {subSnap.opsGiftDays} 天
                      {memberUsage.expireDate ? (
                        <span className="ml-2 text-slate-500">
                          到期 {formatCnDate(memberUsage.expireDate)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">升级会员后在此显示订阅时长与到期日。</p>
                )}
              </div>
                </>
              )}
            </div>
          )}

          {tab === 'partner_clients' && partnerEdition ? <PartnerClientsSection /> : null}

          {tab === 'partner_agents' && partnerEdition && profile.isParent ? (
            <PartnerAgentManagementSection />
          ) : null}

          {tab === 'partner_entitlements' && partnerEdition ? <PartnerEntitlementSection /> : null}

          {SHOW_VERIFY_SYSTEM_TAB && tab === 'verify' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-medium text-gray-900">核销系统对接</h3>
                <p className="text-sm text-gray-500">连接第三方核销SaaS系统</p>
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {verifyList.map((e) => (
                  <div key={e.id} className="rounded-xl border border-gray-200 p-5">
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center">
                        <div className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                          <i className={`${e.icon} text-lg text-indigo-600`} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-medium text-gray-900">{e.name}</h4>
                          <span
                            className={cn(
                              'mt-1 inline-block rounded-full px-2 py-0.5 text-xs',
                              e.status === 'connected'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600',
                            )}
                          >
                            {e.status === 'connected' ? '已连接' : '未连接'}
                          </span>
                        </div>
                      </div>
                      {e.status === 'connected' ? (
                        <button
                          type="button"
                          onClick={() => toggleVerify(e.id)}
                          className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          断开
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleVerify(e.id)}
                          className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                        >
                          连接
                        </button>
                      )}
                    </div>
                    {e.status === 'connected' && e.connectedAt && (
                      <p className="text-xs text-gray-500">连接时间: {e.connectedAt}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'merchant' && (
            <div className="space-y-10">
              {partnerEdition && profile.isAgent ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
                  林客 / 快手服务商应用仅由<strong>总代</strong>维护；子代添加客户时将自动使用总代 SP 凭证。
                </div>
              ) : null}
              {!partnerEdition || profile.isParent ? (
              <section className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    {isPartnerEdition() ? '服务商平台身份' : '团购平台'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {isPartnerEdition()
                      ? '绑定抖音林客、快手团购等平台的服务商应用（非客户商家 token）；完成后再到「客户商家」添加代运营客户'
                      : '抖音来客、快手团购、美团点评、小红书等到店团购经营授权'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {MERCHANT_BACKEND_PLATFORMS.map((p) => {
                    const partnerComingSoon =
                      isPartnerEdition() && !isPartnerSupportedGroupbuyPlatform(p.id)
                    const merchantComingSoon = !isPartnerEdition() && !!p.comingSoon
                    const tabComingSoon = partnerComingSoon || merchantComingSoon
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={tabComingSoon}
                        onClick={() => {
                          if (!tabComingSoon) setMerchantPlat(p.id)
                        }}
                        className={cn(
                          'flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all',
                          merchantPlat === p.id
                            ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                          tabComingSoon && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <PlatformBrandLogo logo={p.logo} alt={p.tabName} size="sm" />
                        {p.tabName}
                        {partnerComingSoon ? (
                          <span className="text-[10px] font-normal text-slate-400">即将支持</span>
                        ) : merchantComingSoon ? (
                          <span className="text-[10px] font-normal text-slate-400">即将开放</span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
                <div className="rounded-xl border border-gray-200 p-6">
                  {isPartnerEdition() && !isPartnerSupportedGroupbuyPlatform(merchantPlat) ? (
                    <p className="py-8 text-center text-sm text-gray-500">
                      该平台的服务商接入即将支持。当前请使用「抖音来客 / 快手团购」Tab 绑定<strong>林客</strong>或快手服务商应用。
                    </p>
                  ) : !isPartnerEdition() &&
                    MERCHANT_BACKEND_PLATFORMS.find((p) => p.id === merchantPlat)?.comingSoon ? (
                    <p className="py-8 text-center text-sm text-gray-500">{MERCHANT_BACKEND_COMING_SOON_MSG}</p>
                  ) : (
                    <>
                      {merchantPlat === 'douyin' && <DouyinMerchantSection />}
                      {merchantPlat === 'kuaishou' && <KuaishouMerchantSection />}
                      {merchantPlat === 'meituan' && <MeituanMerchantSection />}
                      {merchantPlat === 'xhs' && <XhsMerchantSection />}
                    </>
                  )}
                </div>
              </section>
              ) : null}

              {!partnerEdition ? (
              <section className="space-y-4 border-t border-gray-100 pt-8">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">外卖平台</h3>
                  <p className="text-sm text-gray-500">
                    淘宝闪购、美团外卖、京东外卖商家自研 OpenAPI（绑定方式同抖音来客）
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {WAIMAI_BACKEND_PLATFORMS.map((p) => {
                    const tabComingSoon = !!p.comingSoon
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={tabComingSoon}
                        onClick={() => {
                          if (!tabComingSoon) setWaimaiPlat(p.id)
                        }}
                        className={cn(
                          'flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all',
                          waimaiPlat === p.id
                            ? 'border-cyan-200 bg-cyan-50 text-cyan-800 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                          tabComingSoon && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <PlatformBrandLogo logo={p.logo} alt={p.tabName} size="sm" />
                        {p.tabName}
                        {tabComingSoon ? (
                          <span className="text-[10px] font-normal text-slate-400">即将开放</span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
                <div className="rounded-xl border border-gray-200 p-6">
                  {WAIMAI_BACKEND_PLATFORMS.find((p) => p.id === waimaiPlat)?.comingSoon ? (
                    <p className="py-8 text-center text-sm text-gray-500">{MERCHANT_BACKEND_COMING_SOON_MSG}</p>
                  ) : (
                    <>
                  {waimaiPlat === 'eleme' && (
                    <WaimaiMerchantSection platformId="eleme" guideSteps={[...ELEME_BIND_GUIDE_STEPS]} />
                  )}
                  {waimaiPlat === 'meituan_waimai' && (
                    <WaimaiMerchantSection
                      platformId="meituan_waimai"
                      guideSteps={[...MEITUAN_WAIMAI_BIND_GUIDE_STEPS]}
                    />
                  )}
                  {waimaiPlat === 'jd_waimai' && (
                    <WaimaiMerchantSection platformId="jd_waimai" guideSteps={[...JD_WAIMAI_BIND_GUIDE_STEPS]} />
                  )}
                    </>
                  )}
                </div>
              </section>
              ) : null}
            </div>
          )}

          {tab === 'accounts' && (
            <div className="space-y-8">
              <div>
                <h3 className="mb-1 text-lg font-medium text-gray-900">本地子账号</h3>
                <p className="mb-4 text-sm text-gray-500">
                  主账号改密请使用右上角头像 → 个人设置。
                </p>
                <SubAccountsPanel />
              </div>
            </div>
          )}

          {tab === 'permissions' && <SubAccountPermissionsPanel />}
        </div>
      </div>
    </div>
  )
}
