import {
  CalendarDays,
  Crown,
  Link2,
  Megaphone,
  ScanLine,
  Shield,
  Store,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '../cn'
import MeooPayQrModal from '../components/MeooPayQrModal'
import {
  computeMemberUsageRemaining,
  fetchPrimaryTenantId,
  fetchTenantSubscriptionSnapshot,
  insertMerchantPaymentOrder,
} from '../lib/tenantBilling'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import AiModelBindingSection from './settings/AiModelBindingSection'
import DouyinMerchantSection from './settings/DouyinMerchantSection'
import LocalPromotionSection from './settings/LocalPromotionSection'
import XhsCommercialSection from './settings/XhsCommercialSection'
import MeituanMerchantSection from './settings/MeituanMerchantSection'
import SubAccountPermissionsPanel from './settings/SubAccountPermissionsPanel'
import SubAccountsPanel from './settings/SubAccountsPanel'
import XhsMerchantSection from './settings/XhsMerchantSection'
import PlatformConnectionsPanel from './settings/PlatformConnectionsPanel'
import { MERCHANT_BACKEND_PLATFORMS, PlatformBrandLogo } from '../lib/platformBranding'
import { useMembership } from '../context/MembershipContext'
import { MEMBERSHIP_MONTHLY_YUAN, type MembershipPlan } from '../lib/membershipPlan'

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

const ALL_TABS = [
  { id: 'platforms' as const, label: '平台连接', icon: Link2 },
  { id: 'commercial' as const, label: '商业化后台', icon: Megaphone },
  { id: 'verify' as const, label: '核销系统', icon: ScanLine },
  { id: 'merchant' as const, label: '商家版后台', icon: Store },
  { id: 'accounts' as const, label: '账号管理', icon: Users },
  { id: 'permissions' as const, label: '权限设置', icon: Shield },
  { id: 'subscription' as const, label: '订阅', icon: CalendarDays },
] as const

const TABS = SHOW_VERIFY_SYSTEM_TAB ? ALL_TABS : ALL_TABS.filter((t) => t.id !== 'verify')

const TAB_IDS = new Set(TABS.map((t) => t.id))

type SettingsTabId = (typeof ALL_TABS)[number]['id']

function formatCnDate(d: Date) {
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

const PLAN_FEATURE_LINES: Record<MembershipPlan, string[]> = {
  free: ['直连 AI 每月 50 次（豆包/千问/MiniMax/DeepSeek）', '不含 GEO、竞对分析、报税管理'],
  member: ['全功能开放', 'AI：豆包 / 千问 / MiniMax / DeepSeek'],
  member_plus: ['全功能开放', '全部 AI 模型（含 OpenAI / Claude / Gemini / Grok）'],
}

export default function SettingsPage() {
  const location = useLocation()
  const { plan, entitlements, reload: reloadMembership } = useMembership()
  const [tab, setTab] = useState<SettingsTabId>('platforms')
  const [merchantPlat, setMerchantPlat] = useState<'douyin' | 'meituan' | 'xhs'>('douyin')
  const [verifyList, setVerifyList] = useState<VerifyItem[]>(VERIFY_INITIAL)
  const [subModalOpen, setSubModalOpen] = useState(false)
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
      return
    }
    try {
      const snap = await fetchTenantSubscriptionSnapshot(supabase)
      setSubSnap({
        serviceExpireAt: snap.serviceExpireAt,
        subscriptionDays: snap.subscriptionDays ?? 0,
        opsGiftDays: snap.opsGiftDays ?? 0,
      })
    } catch {
      setSubSnap({
        serviceExpireAt: null,
        subscriptionDays: 0,
        opsGiftDays: 0,
      })
    }
  }, [supabaseConfigured, supabase])

  const closeSubModal = () => {
    setSubModalOpen(false)
    void loadOfficialBilling()
    void reloadMembership({ silent: true })
  }

  const openSubModal = () => setSubModalOpen(true)

  const submitSubscriptionPaid = async (payload: { amountCents: number; payChannel: 'wechat' | 'alipay' }) => {
    if (!supabaseConfigured || !supabase) {
      throw new Error('未配置 Supabase，无法提交订单。')
    }
    const tid = await fetchPrimaryTenantId(supabase)
    if (!tid) {
      throw new Error('未找到租户关联，请确认已开通商户并完成登录。')
    }
    await insertMerchantPaymentOrder(supabase, {
      tenantId: tid,
      orderKind: 'subscription',
      amountCents: payload.amountCents,
      payChannel: payload.payChannel,
    })
    window.alert('已提交支付申报，请等待运营在「订单管理」核对确认；确认后将自动开通对应会员档位。')
    void loadOfficialBilling()
    void reloadMembership({ silent: true })
  }

  const isPaidMember = plan === 'member' || plan === 'member_plus'
  const memberUsage = useMemo(
    () => computeMemberUsageRemaining(subSnap?.serviceExpireAt ?? null),
    [subSnap?.serviceExpireAt],
  )
  const totalEntitlementDays = (subSnap?.subscriptionDays ?? 0) + (subSnap?.opsGiftDays ?? 0)

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

  /** 地址栏 ?tab= / ?upgrade=1：同步页签（便于书签与外部跳转） */
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    const ts = p.get('tab')
    if (p.get('upgrade') === '1') {
      setTab('subscription')
    } else if (ts && TAB_IDS.has(ts as SettingsTabId)) {
      setTab(ts as SettingsTabId)
    }
  }, [location.search])

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
          管理平台连接、商业化投放、商家后台、账号权限与订阅
        </p>
      </div>

      <MeooPayQrModal
        open={subModalOpen}
        title="订阅墨典 ERP"
        mode="subscription"
        onClose={closeSubModal}
        onCompletedPayment={(p) => submitSubscriptionPaid(p)}
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/60">
          <nav className="flex flex-wrap gap-0.5 px-2 py-1 sm:px-3">
            {TABS.map((t) => {
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
                  对接投流与线索平台：巨量本地推（抖音）、聚光/种小草（小红书，同一授权）。与「商家版后台」店铺经营账号相互独立。
                </p>
              </div>
              <LocalPromotionSection />
              <XhsCommercialSection />
            </div>
          )}

          {tab === 'subscription' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900">订阅</h3>
              <p className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                商家显示名等资料在
                <strong className="font-medium text-gray-800"> 运营管控台 → 客户管理 </strong>
                维护。购买<strong className="font-medium text-gray-800"> 会员版 </strong>或
                <strong className="font-medium text-gray-800"> 会员 Plus </strong>并由运营确认到账后，下方显示
                <strong className="font-medium text-gray-800"> 订阅时长、赠送时长 </strong>与
                <strong className="font-medium text-gray-800"> 总剩余时长 </strong>（截止日以云端登记为准）。
              </p>
              <div className="max-w-xl">
                <div className="rounded-xl border border-gray-200 p-5">
                  <div className="mb-2 flex items-center text-gray-900">
                    <Crown className="mr-2 h-5 w-5 text-amber-500" />
                    <span className="font-semibold">订阅与会员</span>
                  </div>
                  <p className="mb-3 text-sm text-gray-600">
                    新注册默认为<strong className="text-gray-900"> 免费版 </strong>，无试用期；升级会员请在下方选择套餐。
                  </p>
                  <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50/80 px-3 py-2.5 text-sm text-indigo-950">
                    <p className="font-semibold">
                      当前版本：{entitlements.planLabel}
                      {MEMBERSHIP_MONTHLY_YUAN[plan] != null ? (
                        <span className="ml-1 font-normal text-indigo-800/90">
                          （¥{MEMBERSHIP_MONTHLY_YUAN[plan]}/月起）
                        </span>
                      ) : null}
                    </p>
                    <ul className="mt-1.5 list-inside list-disc text-xs text-indigo-900/85">
                      {PLAN_FEATURE_LINES[plan].map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    {plan === 'free' && entitlements.directAiRemaining != null ? (
                      <p className="mt-1.5 text-xs text-indigo-800">
                        本月直连 AI 剩余{' '}
                        <span className="font-semibold tabular-nums">{entitlements.directAiRemaining}</span> /{' '}
                        {entitlements.directAiCallLimit} 次
                      </p>
                    ) : null}
                    <p className="mt-1.5 text-[11px] text-indigo-700/80">
                      与运营管控台「客户管理 → 会员档位」同步；改档后约 20 秒内自动生效。
                    </p>
                  </div>
                  <p className="ui-hint-block text-sm text-gray-600">
                    <strong className="text-gray-900">会员版 ¥168/月</strong>、
                    <strong className="text-gray-900"> 会员 Plus ¥598/月</strong>
                    （含季度套餐）；运营确认到账后自动落位对应版本。
                  </p>
                  <div className="mt-4 space-y-1 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-3 text-sm text-gray-800">
                    {!supabaseConfigured || !supabase ? (
                      <p className="text-gray-600">接入 Supabase 登录后可查看会员剩余使用时间。</p>
                    ) : subSnap === undefined ? (
                      <p className="text-gray-500">正在加载订阅信息…</p>
                    ) : !isPaidMember ? (
                      <p className="text-gray-600">
                        当前为免费版。购买会员版或会员 Plus 并由运营确认到账后，将在此显示订阅时长与剩余使用时间。
                      </p>
                    ) : memberUsage.expireDate || totalEntitlementDays > 0 ? (
                      <>
                        <p className="text-gray-800">
                          <span className="text-gray-500">订阅时长：</span>
                          <span className="tabular-nums font-medium text-gray-900">{subSnap.subscriptionDays}</span> 天
                          <span className="mx-2 text-gray-300">+</span>
                          <span className="text-gray-500">赠送时长：</span>
                          <span className="tabular-nums font-medium text-gray-900">{subSnap.opsGiftDays}</span> 天
                        </p>
                        <p className="pt-1 font-medium text-gray-900">
                          <span className="text-gray-500">总剩余时长：</span>
                          <span className="tabular-nums">
                            {memberUsage.remainDays != null && memberUsage.remainDays > 0
                              ? memberUsage.remainDays
                              : 0}
                          </span>{' '}
                          天
                          <span className="ml-2 text-xs font-normal text-gray-400">
                            （累计权益 {totalEntitlementDays} 天）
                          </span>
                        </p>
                        {memberUsage.expireDate ? (
                          <p className="pt-1 text-gray-800">
                            <span className="text-gray-500">会员到期：</span>
                            {formatCnDate(memberUsage.expireDate)}
                          </p>
                        ) : null}
                        {memberUsage.remainDays != null && memberUsage.remainDays === 0 ? (
                          <p className="pt-1 text-sm font-medium text-amber-800">今日到期，请尽快续费。</p>
                        ) : null}
                        {memberUsage.remainDays != null && memberUsage.remainDays < 0 ? (
                          <p className="pt-1 text-sm text-amber-800">
                            会员已过期{' '}
                            <span className="tabular-nums font-semibold">{Math.abs(memberUsage.remainDays)}</span>{' '}
                            天，续费后可继续使用。
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-gray-600">
                        会员档位已开通，服务截止日待运营登记。请稍后刷新或联系客户经理。
                      </p>
                    )}
                  </div>
                  <ul className="ui-hint-block mt-3 list-inside list-disc space-y-1 text-sm text-gray-600">
                    <li>到期成功续费：保持全部编辑与同步能力</li>
                    <li>续费失败：降级为查看模式（不可新建商品、达人招募等）</li>
                  </ul>
                  <button
                    type="button"
                    onClick={openSubModal}
                    className="mt-5 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    打开订阅窗口
                  </button>
                </div>
              </div>
            </div>
          )}

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
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-medium text-gray-900">商家版后台</h3>
                <p className="text-sm text-gray-500">切换查看各平台商家后台</p>
              </div>
              <div className="mb-6 flex flex-wrap gap-2">
                {MERCHANT_BACKEND_PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setMerchantPlat(p.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all',
                      merchantPlat === p.id
                        ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <PlatformBrandLogo logo={p.logo} alt={p.tabName} size="sm" />
                    {p.tabName}
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-gray-200 p-6">
                {merchantPlat === 'douyin' && <DouyinMerchantSection />}

                {merchantPlat === 'meituan' && <MeituanMerchantSection />}

                {merchantPlat === 'xhs' && <XhsMerchantSection />}
              </div>
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
