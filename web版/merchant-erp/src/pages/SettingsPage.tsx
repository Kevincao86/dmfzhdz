import {
  CalendarDays,
  Crown,
  Link2,
  Plus,
  ScanLine,
  Shield,
  Store,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '../cn'
import MeooPayQrModal from '../components/MeooPayQrModal'
import { MEOO_TRIAL_SNAPSHOT_KEY } from '../lib/opsRegistryConstants'
import {
  fetchPrimaryTenantId,
  fetchTenantSubscriptionSnapshot,
  insertMerchantPaymentOrder,
} from '../lib/tenantBilling'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import AiModelBindingSection from './settings/AiModelBindingSection'
import DouyinMerchantSection from './settings/DouyinMerchantSection'
import MeituanMerchantSection from './settings/MeituanMerchantSection'
import SubAccountPermissionsPanel from './settings/SubAccountPermissionsPanel'
import SubAccountsPanel from './settings/SubAccountsPanel'
import XhsMerchantSection from './settings/XhsMerchantSection'

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

const PLAT_BIND = [
  { id: 'douyin', name: '抖音来客', icon: 'fa-brands fa-tiktok', max: 3 },
  { id: 'meituan', name: '美团点评', icon: 'fa-solid fa-utensils', max: 3 },
  { id: 'xhs', name: '小红书', icon: 'fa-solid fa-book', max: 3 },
  { id: 'jd', name: '京东本地生活', icon: 'fa-solid fa-bag-shopping', max: 3 },
]

/** 恢复「核销系统」页签与对接区块时改为 true */
const SHOW_VERIFY_SYSTEM_TAB = false

const ALL_TABS = [
  { id: 'platforms' as const, label: '平台连接', icon: Link2 },
  { id: 'subscription' as const, label: '订阅与试用', icon: CalendarDays },
  { id: 'verify' as const, label: '核销系统', icon: ScanLine },
  { id: 'merchant' as const, label: '商家版后台', icon: Store },
  { id: 'accounts' as const, label: '账号管理', icon: Users },
  { id: 'permissions' as const, label: '权限设置', icon: Shield },
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

export default function SettingsPage() {
  const location = useLocation()
  const [tab, setTab] = useState<SettingsTabId>('platforms')
  const [merchantPlat, setMerchantPlat] = useState<'douyin' | 'meituan' | 'xhs'>('douyin')
  const [verifyList, setVerifyList] = useState<VerifyItem[]>(VERIFY_INITIAL)
  const [subModalOpen, setSubModalOpen] = useState(false)
  const [officialExpireAtIso, setOfficialExpireAtIso] = useState<string | null | undefined>(undefined)
  /** undefined：未拉取；null：无到期记录 */
  const [officialCumulativeDays, setOfficialCumulativeDays] = useState<number | null | undefined>(undefined)
  /** undefined：未拉取；null：无累计天数 */

  const loadOfficialBilling = useCallback(async () => {
    if (!supabaseConfigured || !supabase) {
      setOfficialExpireAtIso(undefined)
      setOfficialCumulativeDays(undefined)
      return
    }
    try {
      const snap = await fetchTenantSubscriptionSnapshot(supabase)
      setOfficialExpireAtIso(snap.serviceExpireAt)
      setOfficialCumulativeDays(snap.officialDays)
    } catch {
      setOfficialExpireAtIso(null)
      setOfficialCumulativeDays(null)
    }
  }, [supabaseConfigured, supabase])

  const closeSubModal = () => {
    setSubModalOpen(false)
    void loadOfficialBilling()
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
    window.alert('已提交支付申报，请等待运营在「订单管理」核对确认。')
    void loadOfficialBilling()
  }

  const trialStart = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 3)
    return d
  }, [])
  const trialEnd = useMemo(() => {
    const d = new Date(trialStart)
    d.setDate(d.getDate() + 14)
    return d
  }, [trialStart])

  const trialLeftDays = useMemo(() => {
    const now = new Date()
    const ms = trialEnd.getTime() - now.getTime()
    return Math.max(0, Math.ceil(ms / 86400000))
  }, [trialEnd])

  const officialLeftDays = useMemo(() => {
    if (!officialExpireAtIso) return null
    const end = new Date(officialExpireAtIso)
    if (Number.isNaN(end.getTime())) return null
    return Math.ceil((end.getTime() - Date.now()) / 86400000)
  }, [officialExpireAtIso])

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setOfficialExpireAtIso(undefined)
      setOfficialCumulativeDays(undefined)
      return
    }
    let cancelled = false
    const run = async () => {
      try {
        const snap = await fetchTenantSubscriptionSnapshot(supabase)
        if (cancelled) return
        setOfficialExpireAtIso(snap.serviceExpireAt)
        setOfficialCumulativeDays(snap.officialDays)
      } catch {
        if (!cancelled) {
          setOfficialExpireAtIso(null)
          setOfficialCumulativeDays(null)
        }
      }
    }
    void run()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void run()
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabaseConfigured, supabase, tab])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        MEOO_TRIAL_SNAPSHOT_KEY,
        JSON.stringify({ trialStart: trialStart.toISOString(), trialEnd: trialEnd.toISOString() }),
      )
    } catch {
      /* ignore */
    }
  }, [trialStart, trialEnd])

  /** 地址栏 ?tab=：同步页签（便于书签与外部跳转） */
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    const ts = p.get('tab')
    if (ts && TAB_IDS.has(ts as SettingsTabId)) {
      setTab(ts as SettingsTabId)
    }
  }, [location.search])

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
          管理平台连接、订阅与商家后台、账号权限与基础配置
        </p>
      </div>

      <MeooPayQrModal
        open={subModalOpen}
        title="订阅店魔方 ERP"
        mode="subscription"
        onClose={closeSubModal}
        onCompletedPayment={(p) => submitSubscriptionPaid(p)}
      />

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200">
          <nav className="flex flex-wrap gap-1 px-2 sm:px-4">
            {TABS.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id as SettingsTabId)}
                  className={cn(
                    'flex items-center px-3 py-3 text-sm font-medium transition-colors sm:px-4',
                    tab === t.id
                      ? 'border-b-2 border-blue-600 bg-blue-50 text-blue-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0" />
                  {t.label}
                </button>
              )
            })}
          </nav>
        </div>

        <div className="p-6">
          {tab === 'platforms' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-medium text-gray-900">平台账号绑定</h3>
                <p className="text-sm text-gray-500">每个平台最多可绑定3个账号</p>
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {PLAT_BIND.map((p) => (
                  <div key={p.id} className="rounded-xl border border-gray-200 p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                          <i className={`${p.icon} text-lg text-gray-600`} />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900">{p.name}</h4>
                          <p className="text-sm text-gray-500">0/{p.max} 个账号</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        绑定
                      </button>
                    </div>
                    <div className="py-4 text-center text-sm text-gray-400">暂无绑定账号</div>
                  </div>
                ))}
              </div>

              <AiModelBindingSection />
            </div>
          )}

          {tab === 'subscription' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900">订阅与试用</h3>
              <p className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                商家显示名等资料在
                <strong className="font-medium text-gray-800"> 运营管控台 → 客户管理 </strong>
                维护；右侧展示当前租户在云端记录的<strong className="font-medium text-gray-800"> 正式版到期日 </strong>
                与<strong className="font-medium text-gray-800"> 累计已确认权益天数 </strong>
                （运营在「订单管理」确认到账后写入）。
              </p>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
                  <div className="mb-2 text-sm font-medium text-blue-900">可使用日期（新注册用户）</div>
                  <p className="text-sm text-blue-800">
                    免费试用共 <strong>14 天</strong>，自注册成功当日 0 时起算，全功能开放。
                  </p>
                  <div className="mt-4 space-y-1 text-sm text-blue-900/90">
                    <p>
                      <span className="text-blue-700/80">试用开始：</span>
                      {formatCnDate(trialStart)}
                    </p>
                    <p>
                      <span className="text-blue-700/80">试用结束：</span>
                      {formatCnDate(trialEnd)}
                    </p>
                    <p className="pt-2 text-base font-semibold text-blue-900">
                      剩余试用：<span className="tabular-nums">{trialLeftDays}</span> 天
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 p-5">
                  <div className="mb-2 flex items-center text-gray-900">
                    <Crown className="mr-2 h-5 w-5 text-amber-500" />
                    <span className="font-semibold">正式版订阅</span>
                  </div>
                  <p className="ui-hint-block text-sm text-gray-600">
                    基础版 <strong className="text-gray-900">¥99 / 月</strong>，支持自动续费，到期前可随时取消。
                  </p>
                  <div className="mt-4 space-y-1 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-3 text-sm text-gray-800">
                    {!supabaseConfigured || !supabase ? (
                      <p className="text-gray-600">接入 Supabase 登录后可查看当前租户正式版服务有效期。</p>
                    ) : officialExpireAtIso === undefined ? (
                      <p className="text-gray-500">正在加载订阅信息…</p>
                    ) : officialExpireAtIso ? (
                      <>
                        <p>
                          <span className="text-gray-500">正式版到期：</span>
                          {formatCnDate(new Date(officialExpireAtIso))}
                        </p>
                        <p className="pt-1 font-medium text-gray-900">
                          {officialLeftDays != null && officialLeftDays > 0 ? (
                            <>
                              剩余可用：<span className="tabular-nums">{officialLeftDays}</span> 天
                            </>
                          ) : officialLeftDays != null && officialLeftDays === 0 ? (
                            <>今日到期，请尽快续费</>
                          ) : officialLeftDays != null && officialLeftDays < 0 ? (
                            <span className="text-amber-700">
                              已过期 <span className="tabular-nums">{Math.abs(officialLeftDays)}</span> 天，续费后可恢复全功能
                            </span>
                          ) : null}
                        </p>
                        {officialCumulativeDays != null && officialCumulativeDays > 0 ? (
                          <p className="pt-1 text-gray-600">
                            <span className="text-gray-500">累计已确认权益：</span>
                            <span className="tabular-nums font-medium text-gray-900">{officialCumulativeDays}</span> 天
                          </p>
                        ) : null}
                      </>
                    ) : officialCumulativeDays != null && officialCumulativeDays > 0 ? (
                      <>
                        <p>
                          <span className="text-gray-500">累计已确认正式版权益：</span>
                          <span className="tabular-nums font-semibold text-gray-900">{officialCumulativeDays}</span> 天
                        </p>
                        <p className="pt-2 text-xs leading-relaxed text-gray-500">
                          云端尚未写入「服务截止日期」字段时，仅显示累计天数。请稍后刷新本页；若长期无到期日，请联系客户经理在运营台核对租户信息。
                        </p>
                      </>
                    ) : (
                      <p className="text-gray-600">
                        当前未查询到正式版到期日与累计权益。完成订阅并由运营确认到账后，将在此显示；您也可稍后重新进入本页签刷新。
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
                {(
                  [
                    { id: 'douyin' as const, name: '抖音来客' },
                    { id: 'meituan' as const, name: '美团点评' },
                    { id: 'xhs' as const, name: '小红书' },
                  ]
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setMerchantPlat(p.id)}
                    className={cn(
                      'flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                      merchantPlat === p.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                    )}
                  >
                    <Store className="mr-2 h-4 w-4" />
                    {p.name}
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
