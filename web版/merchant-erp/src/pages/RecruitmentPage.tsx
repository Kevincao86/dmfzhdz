import { motion } from 'framer-motion'
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  Eye,
  FileText,
  GraduationCap,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  UserCheck,
  Video,
} from 'lucide-react'
import MeooPayQrModal from '../components/MeooPayQrModal'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import RecruitmentBriefWizard from '../components/recruitment/RecruitmentBriefWizard'
import { cn } from '../cn'
import { buildErpRegistryTenant } from '../lib/buildErpRegistryTenant'
import {
  readKolBriefRecords,
  readSelectedBriefForRecruitment,
  writeKolBriefRecords,
  writeSelectedBriefForRecruitment,
  type KolBriefRecord,
  type SelectedBriefPayload,
} from '../lib/kolBriefStorage'
import { DB_MIGRATION_HINT_ZH, shouldSuggestDbMigration } from '../lib/dbSchemaErrorHint'
import { loadRecruitmentIndustryL1Labels } from '../lib/recruitmentIndustryOptions'
import { buildRecruitmentProgressSteps, recruitmentOrderStatusLabel } from '../lib/recruitmentOrderProgress'
import { readMerchantSession } from '../lib/merchantSession'
import { appendRecruitmentOrderToOps, fetchOpsRegistry } from '../lib/opsRegistryClient'
import type { RegistryRecruitmentOrder } from '../lib/opsRegistryTypes'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { fetchPrimaryTenantId, fetchTenantWalletSummary, insertMerchantPaymentOrder } from '../lib/tenantBilling'
import { getDouyinStores, type DouyinStoreRow } from '../services/douyinMerchantApi'
import {
  RecruitmentPaymentView,
  RecruitmentScheduleView,
  RecruitmentTalentPoolView,
  RecruitmentVideoReviewView,
} from './recruitment/RecruitmentFlowViews'
import NoviceRecruitmentForm from './recruitment/NoviceRecruitmentForm'

const FLOW = [
  {
    title: '发布招募需求',
    desc: '设置探店时间段、地点、达人标签、预算等招募条件',
    icon: Target,
    color: 'bg-blue-500',
    view: 'createPick' as const,
  },
  {
    title: 'AI达人池筛选',
    desc: '通过巨量星图智能匹配符合需求的达人，支持替换和确认操作',
    icon: UserCheck,
    color: 'bg-indigo-500',
    view: 'confirm' as const,
  },
  {
    title: 'AI排期编排',
    desc: '按达人和门店产能自动排布时间，生成排期单，支持冲突替换',
    icon: Calendar,
    color: 'bg-cyan-500',
    view: 'schedule' as const,
  },
  {
    title: '视频审核管理',
    desc: '达人上传视频后进行审核，AI反馈调整意见，支持发布排期',
    icon: Video,
    color: 'bg-violet-500',
    view: 'review' as const,
  },
  {
    title: '结款账单',
    desc: '视频审核通过并发布后，确认结款，返还账单信息',
    icon: FileText,
    color: 'bg-gray-400',
    view: 'payment' as const,
  },
]

const PLAT_OPTS = ['抖音', '小红书', '美团', '快手'] as const
const CONTENT_OPTS = ['短视频', '直播', '图文'] as const
const VISIT_SLOTS = ['09:00-12:00', '12:00-14:00', '14:00-17:00', '17:00-20:00', '20:00-22:00'] as const

const FOLLOWER_TIER_OPTS = ['1000-5000', '5000-1万', '1万+', '5万+', '10万+', '50万+'] as const
const COMMERCE_LEVEL_OPTS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6+'] as const

/** 商家佣金率快捷档位（筛选） */
const COMMISSION_PRESET_PCTS = [0, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 80] as const

function filterCommissionInputDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 3)
}

/** 招募总预算（元）→ 充值弹窗预填字符串 */
function formatBudgetYuanForPrefill(yuan: number): string {
  if (!Number.isFinite(yuan) || yuan <= 0) return ''
  const cents = Math.round(yuan * 100)
  return String(cents / 100)
}

function parseCommissionPctFromDraft(draft: string): number {
  const d = draft.replace(/\D/g, '')
  if (!d) return 0
  const n = parseInt(d, 10)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(80, n))
}

type StoreRow = { name: string; address: string }

const RECRUITMENT_CREATE_DRAFT_KEY = 'meoo_recruitment_create_draft_v1'

type RecruitmentCreateDraftV1 = {
  v: 1
  name: string
  recruitMode: 'ai' | 'designated'
  designatedInput: string
  platforms: string[]
  contentTypes: string[]
  recruitStart: string
  recruitEnd: string
  visitStart: string
  visitEnd: string
  visitSlots: string[]
  /** 商家提供佣金率 0～80 */
  merchantCommissionPct: number
  industry: string
  provideMeal: boolean
  tablePerMeal: number
  stores: StoreRow[]
  talentTags: string[]
  followerTiers: string[]
  commerceLevels: string[]
  budget: number
  headcount: number
  note: string
}

function CreateForm({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState('')
  const [recruitMode, setRecruitMode] = useState<'ai' | 'designated'>('ai')
  const [designatedOpen, setDesignatedOpen] = useState(false)
  const [designatedInput, setDesignatedInput] = useState('')
  const [platforms, setPlatforms] = useState<string[]>(['抖音'])
  const [contentTypes, setContentTypes] = useState<string[]>(['短视频'])
  const [recruitStart, setRecruitStart] = useState('')
  const [recruitEnd, setRecruitEnd] = useState('')
  const [visitStart, setVisitStart] = useState('')
  const [visitEnd, setVisitEnd] = useState('')
  const [visitSlots, setVisitSlots] = useState<string[]>(['09:00-12:00'])
  /** 手动输入中的字符串，仅数字；失焦后规范为 0～80 */
  const [commissionInput, setCommissionInput] = useState('15')
  const [categoryOptions, setCategoryOptions] = useState<string[]>(['餐饮'])
  const [industry, setIndustry] = useState('餐饮')
  const [provideMeal, setProvideMeal] = useState(false)
  const [tablePerMeal, setTablePerMeal] = useState(4)
  const [stores, setStores] = useState<StoreRow[]>([{ name: '', address: '' }])
  const [douyinStoreRows, setDouyinStoreRows] = useState<DouyinStoreRow[]>([])
  const [storesSyncing, setStoresSyncing] = useState(false)
  const [storesErr, setStoresErr] = useState<string | null>(null)
  const [talentTags, setTalentTags] = useState<string[]>([])
  const [followerTiers, setFollowerTiers] = useState<string[]>([])
  const [commerceLevels, setCommerceLevels] = useState<string[]>([])
  const [budget, setBudget] = useState(0)
  const [headcount, setHeadcount] = useState(0)
  const [note, setNote] = useState('')
  const [briefPickerOpen, setBriefPickerOpen] = useState(false)
  const [selectedBrief, setSelectedBrief] = useState<SelectedBriefPayload | null>(() => readSelectedBriefForRecruitment())
  const [submitting, setSubmitting] = useState(false)
  const [pushErr, setPushErr] = useState<string | null>(null)
  const [recruitRechargeOpen, setRecruitRechargeOpen] = useState(false)
  const [recruitRechargePrefillYuan, setRecruitRechargePrefillYuan] = useState('')
  const skipRecruitmentWalletCheckRef = useRef(false)

  useEffect(() => {
    setSelectedBrief(readSelectedBriefForRecruitment())
  }, [briefPickerOpen])

  useEffect(() => {
    let on = true
    void (async () => {
      const opts = await loadRecruitmentIndustryL1Labels()
      if (!on) return
      setCategoryOptions(opts)
      setIndustry((prev) => (opts.includes(prev) ? prev : opts[0] ?? '餐饮'))
      setTalentTags((tags) => {
        if (tags.length) return tags.filter((t) => opts.includes(t))
        const first = opts[0]
        return first ? [first] : []
      })
    })()
    return () => {
      on = false
    }
  }, [])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECRUITMENT_CREATE_DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw) as Partial<RecruitmentCreateDraftV1>
      if (d.v !== 1) return
      if (typeof d.name === 'string') setName(d.name)
      if (d.recruitMode === 'ai' || d.recruitMode === 'designated') setRecruitMode(d.recruitMode)
      if (typeof d.designatedInput === 'string') setDesignatedInput(d.designatedInput)
      if (Array.isArray(d.platforms)) setPlatforms(d.platforms)
      if (Array.isArray(d.contentTypes)) setContentTypes(d.contentTypes)
      if (typeof d.recruitStart === 'string') setRecruitStart(d.recruitStart)
      if (typeof d.recruitEnd === 'string') setRecruitEnd(d.recruitEnd)
      if (typeof d.visitStart === 'string') setVisitStart(d.visitStart)
      if (typeof d.visitEnd === 'string') setVisitEnd(d.visitEnd)
      if (Array.isArray(d.visitSlots) && d.visitSlots.length) setVisitSlots(d.visitSlots)
      if (typeof d.merchantCommissionPct === 'number' && Number.isFinite(d.merchantCommissionPct)) {
        const p = Math.max(0, Math.min(80, Math.round(d.merchantCommissionPct)))
        setCommissionInput(String(p))
      }
      if (typeof d.industry === 'string') setIndustry(d.industry)
      if (typeof d.provideMeal === 'boolean') setProvideMeal(d.provideMeal)
      if (typeof d.tablePerMeal === 'number' && Number.isFinite(d.tablePerMeal)) setTablePerMeal(d.tablePerMeal)
      if (Array.isArray(d.stores) && d.stores.length) setStores(d.stores.map((s) => ({ name: String(s.name ?? ''), address: String(s.address ?? '') })))
      if (Array.isArray(d.talentTags)) setTalentTags(d.talentTags.filter((t): t is string => typeof t === 'string'))
      if (Array.isArray(d.followerTiers))
        setFollowerTiers(d.followerTiers.filter((t): t is string => typeof t === 'string' && (FOLLOWER_TIER_OPTS as readonly string[]).includes(t)))
      if (Array.isArray(d.commerceLevels))
        setCommerceLevels(d.commerceLevels.filter((t): t is string => typeof t === 'string' && (COMMERCE_LEVEL_OPTS as readonly string[]).includes(t)))
      if (typeof d.budget === 'number' && Number.isFinite(d.budget)) setBudget(d.budget)
      if (typeof d.headcount === 'number' && Number.isFinite(d.headcount)) setHeadcount(d.headcount)
      if (typeof d.note === 'string') setNote(d.note)
    } catch {
      /* ignore corrupt draft */
    }
  }, [])

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) => {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  }

  const pickBriefFromRecord = (rec: KolBriefRecord, variantIndex: 0 | 1 | 2) => {
    const text = rec.previews[variantIndex] ?? ''
    const payload: SelectedBriefPayload = {
      recordId: rec.id,
      variantIndex,
      text,
      platform: rec.platform,
      mainProductName: rec.mainProductName,
      tags: rec.tags,
    }
    writeSelectedBriefForRecruitment(payload)
    setSelectedBrief(payload)
    setBriefPickerOpen(false)
  }

  const submit = async () => {
    setPushErr(null)
    if (!name.trim()) {
      setPushErr('请填写招募名称')
      return
    }
    if (!selectedBrief?.text.trim()) {
      setPushErr('请通过「选择Brief」关联上一步生成的达人 Brief')
      return
    }
    if (recruitMode === 'designated' && !designatedInput.trim()) {
      setPushErr('指定达人模式下请填写达人昵称或达人 ID')
      return
    }
    if (!Number.isFinite(budget) || budget <= 0) {
      setPushErr('请填写总预算（大于 0）')
      return
    }
    if (!Number.isFinite(headcount) || headcount <= 0) {
      setPushErr('请填写招募人数（大于 0）')
      return
    }

    if (!skipRecruitmentWalletCheckRef.current) {
      if (supabaseConfigured && supabase) {
        try {
          const tid = await fetchPrimaryTenantId(supabase)
          if (tid) {
            const { balanceCents } = await fetchTenantWalletSummary(supabase, tid)
            const needCents = Math.round(Number(budget) * 100)
            if (needCents > 0 && balanceCents < needCents) {
              const prefill = formatBudgetYuanForPrefill(budget)
              setRecruitRechargePrefillYuan(prefill)
              setRecruitRechargeOpen(true)
              return
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          setPushErr(shouldSuggestDbMigration(msg) ? DB_MIGRATION_HINT_ZH : `无法校验钱包余额：${msg}`)
          return
        }
      }
    } else {
      skipRecruitmentWalletCheckRef.current = false
    }

    setSubmitting(true)
    try {
      const merchantCommissionPct = parseCommissionPctFromDraft(commissionInput)
      const tenant = buildErpRegistryTenant()
      const customerName = tenant?.merchantName ?? '店魔方 ERP 商户'
      const validStores = stores.filter((s) => s.name.trim())
      const storeName = validStores[0]?.name.trim() || '—'
      const storeAddress = validStores[0]?.address.trim() || '—'
      const id = `RO${Date.now()}`
      const order: RegistryRecruitmentOrder = {
        id,
        customerName,
        storeName,
        talentId: '—',
        talentName: '待管控台接单分配',
        fans: 0,
        accountType: platforms.join(' / ') || '—',
        coopTimes: 0,
        createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
        status: 'pending',
        serviceAmount: budget,
        commissionPct: 15,
        netAmount: Math.round(Math.max(0, budget) * 0.85),
        storeAddress,
        category: talentTags[0] ?? '达人招募',
        infoSummary: `招募：${name}；模式：${recruitMode === 'designated' ? `指定达人(${designatedInput.trim()})` : 'AI智能匹配'}；Brief：${selectedBrief.mainProductName}（${selectedBrief.platform}）；预算¥${budget}/${headcount}人；行业${industry}；商家佣金率${merchantCommissionPct}%；桌数${industry === '餐饮' && provideMeal ? tablePerMeal : '—'}；时段${visitSlots.join('、')}；达人标签${talentTags.join('、') || '—'}；粉丝量级${followerTiers.join('、') || '—'}；带货等级${commerceLevels.join('、') || '—'}`,
      }
      window.localStorage.setItem(
        'meoo_last_recruitment_submit',
        JSON.stringify({
          name,
          tablePerMeal: industry === '餐饮' && provideMeal ? tablePerMeal : undefined,
          visitSlots,
          visitStart,
          visitEnd,
          merchantCommissionPct,
          stores: validStores,
          talentTags,
          followerTiers,
          commerceLevels,
        }),
      )
      await appendRecruitmentOrderToOps(order)
      try {
        window.localStorage.setItem('meoo_last_recruitment_order_id', id)
      } catch {
        /* ignore */
      }
      window.alert('需求已打包推送至运营管控台「达人招募订单」，状态：待接单。')
      onBack()
    } catch (e) {
      const detail = e instanceof Error ? e.message.trim() : String(e)
      setPushErr(
        detail
          ? `推送失败：${detail.length > 280 ? `${detail.slice(0, 280)}…` : detail}`
          : '推送失败：请确认网络正常，且运营侧服务与数据同步已就绪。若多次失败请联系管理员。',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const onRecruitmentRechargePaid = async (payload: { amountCents: number; payChannel: 'wechat' | 'alipay' }) => {
    if (!supabase) throw new Error('未配置 Supabase')
    const tid = await fetchPrimaryTenantId(supabase)
    if (!tid) throw new Error('未找到租户关联')
    await insertMerchantPaymentOrder(supabase, {
      tenantId: tid,
      orderKind: 'recharge',
      amountCents: payload.amountCents,
      payChannel: payload.payChannel,
    })
    skipRecruitmentWalletCheckRef.current = true
    setRecruitRechargeOpen(false)
    await submit()
  }

  const briefRecords = useMemo(() => readKolBriefRecords(), [briefPickerOpen, selectedBrief])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        返回招募管理
      </button>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">发布招募需求</h2>

            <div className="mb-6">
              <p className="mb-2 text-sm font-medium text-gray-800">1 招募模式</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setRecruitMode('ai')
                    setDesignatedOpen(false)
                  }}
                  className={cn(
                    'rounded-xl border-2 p-4 text-left transition-colors',
                    recruitMode === 'ai' ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200 hover:border-gray-300',
                  )}
                >
                  <div className="flex items-center text-sm font-semibold text-blue-900">
                    <Sparkles className="mr-2 h-4 w-4" />
                    AI智能匹配
                  </div>
                  <p className="mt-1 text-xs text-blue-800/90">根据条件自动从星图匹配达人</p>
                </button>
                <button
                  type="button"
                  onClick={() => setDesignatedOpen(true)}
                  className={cn(
                    'rounded-xl border-2 p-4 text-left transition-colors',
                    recruitMode === 'designated' || designatedOpen
                      ? 'border-blue-500 bg-blue-50/50'
                      : 'border-gray-200 hover:border-gray-300',
                  )}
                >
                  <div className="text-sm font-semibold text-gray-900">指定达人</div>
                  <p className="mt-1 text-xs text-gray-600">填写达人昵称或达人 ID</p>
                  {recruitMode === 'designated' && designatedInput.trim() ? (
                    <p className="mt-2 truncate text-xs font-medium text-blue-700">已填：{designatedInput.trim()}</p>
                  ) : null}
                </button>
              </div>
            </div>

            <div className="mb-6 space-y-4">
              <p className="text-sm font-medium text-gray-800">2 招募信息</p>
              <label className="block text-sm font-medium text-gray-700">
                招募名称 <span className="text-red-500">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：2024春季美食探店招募"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <div>
                <span className="mb-2 block text-sm font-medium text-gray-700">投放平台</span>
                <div className="flex flex-wrap gap-2">
                  {PLAT_OPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => toggle(platforms, p, setPlatforms)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-sm',
                        platforms.includes(p) ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-700',
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-2 block text-sm font-medium text-gray-700">内容形态</span>
                <div className="flex flex-wrap gap-2">
                  {CONTENT_OPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => toggle(contentTypes, p, setContentTypes)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-sm',
                        contentTypes.includes(p) ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-700',
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">招募开始时间</label>
                  <input type="datetime-local" value={recruitStart} onChange={(e) => setRecruitStart(e.target.value)} className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">招募结束时间</label>
                  <input type="datetime-local" value={recruitEnd} onChange={(e) => setRecruitEnd(e.target.value)} className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">探店开始日期</label>
                  <input type="date" value={visitStart} onChange={(e) => setVisitStart(e.target.value)} className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">探店结束日期</label>
                  <input type="date" value={visitEnd} onChange={(e) => setVisitEnd(e.target.value)} className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm" />
                </div>
              </div>
              <div>
                <span className="mb-2 block text-sm font-medium text-gray-700">可探店时间</span>
                <div className="flex flex-wrap gap-2">
                  {VISIT_SLOTS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggle(visitSlots, s, setVisitSlots)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs',
                        visitSlots.includes(s) ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-gray-200',
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">商家提供佣金率</label>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex min-w-[8rem] max-w-xs flex-1 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={commissionInput}
                      onChange={(e) => setCommissionInput(filterCommissionInputDigits(e.target.value))}
                      onBlur={() => {
                        const p = parseCommissionPctFromDraft(commissionInput)
                        setCommissionInput(String(p))
                      }}
                      placeholder="0-80"
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-gray-900 outline-none"
                    />
                    <span className="shrink-0 text-sm text-gray-500">%</span>
                  </div>
                  <span className="pb-2 text-xs text-gray-500">
                    当前有效：{parseCommissionPctFromDraft(commissionInput)}%（0～80，仅数字）
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-500">快捷筛选：</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {COMMISSION_PRESET_PCTS.map((p) => {
                    const active = parseCommissionPctFromDraft(commissionInput) === p
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setCommissionInput(String(p))}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-xs',
                          active ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-300',
                        )}
                      >
                        {p}%
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs text-gray-500">用于招募说明与运营侧参考（与平台订单佣金字段独立）</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">行业类型</label>
                <p className="mb-1 text-xs text-gray-500">与「门店毛利配置 / 创建商品」来客类目一级一致（优先 API，失败回退示例树）</p>
                <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              {industry === '餐饮' ? (
                <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-4">
                  <label className="flex items-center gap-2 text-sm text-gray-800">
                    <input type="checkbox" checked={provideMeal} onChange={(e) => setProvideMeal(e.target.checked)} />
                    提供餐食
                  </label>
                  {provideMeal ? (
                    <>
                      <p className="mt-2 text-xs text-gray-600">期望几人一桌</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setTablePerMeal(n)}
                            className={cn(
                              'rounded-lg border px-2 py-1 text-xs',
                              tablePerMeal === n ? 'border-blue-600 bg-blue-50' : 'border-gray-200',
                            )}
                          >
                            {n}人
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-800">
                    门店信息 <span className="text-red-500">*</span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={storesSyncing}
                      onClick={async () => {
                        setStoresErr(null)
                        const tok = readMerchantSession('meoo_douyin_merchant_token')
                        if (!tok) {
                          setStoresErr('请先在系统设置绑定抖音来客并登录门店账号')
                          return
                        }
                        setStoresSyncing(true)
                        try {
                          const r = await getDouyinStores({
                            accessToken: tok,
                            merchantId: readMerchantSession('meoo_douyin_merchant_id') ?? undefined,
                            page: 1,
                            pageSize: 100,
                            claimScope: 'claimed',
                            relationType: 'all',
                          })
                          if (!r.ok) {
                            setStoresErr(r.message)
                            setDouyinStoreRows([])
                            return
                          }
                          setDouyinStoreRows(r.items)
                        } finally {
                          setStoresSyncing(false)
                        }
                      }}
                      className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
                    >
                      {storesSyncing ? '同步中…' : '同步来客门店'}
                    </button>
                    <button
                      type="button"
                      className="text-xs font-medium text-blue-600 hover:underline"
                      onClick={() => setStores((s) => [...s, { name: '', address: '' }])}
                    >
                      + 添加门店
                    </button>
                  </div>
                </div>
                {storesErr ? <p className="mb-2 text-xs text-red-600">{storesErr}</p> : null}
                {douyinStoreRows.length ? (
                  <div className="mb-3">
                    <label className="mb-1 block text-xs text-gray-600">从来客列表填充当前门店行</label>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const id = e.target.value
                        if (!id) return
                        const row = douyinStoreRows.find((x) => x.id === id)
                        e.target.value = ''
                        if (!row) return
                        setStores((prev) => {
                          const next = [...prev]
                          next[0] = { name: row.name, address: row.address ?? '' }
                          return next
                        })
                      }}
                      className="w-full max-w-md rounded-lg border border-gray-200 px-2 py-2 text-sm"
                    >
                      <option value="">选择门店填入「门店 1」…</option>
                      {douyinStoreRows.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                          {r.brandName ? ` · ${r.brandName}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {stores.map((s, i) => (
                  <div key={i} className="mb-3 rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                    <p className="mb-2 text-xs font-medium text-gray-600">门店 {i + 1}</p>
                    <input
                      value={s.name}
                      onChange={(e) => {
                        const v = e.target.value
                        setStores((prev) => prev.map((x, j) => (j === i ? { ...x, name: v } : x)))
                      }}
                      placeholder="门店名称（按回车继续填写下一个）"
                      className="mb-2 w-full rounded border border-gray-200 px-2 py-2 text-sm"
                    />
                    <input
                      value={s.address}
                      onChange={(e) => {
                        const v = e.target.value
                        setStores((prev) => prev.map((x, j) => (j === i ? { ...x, address: v } : x)))
                      }}
                      placeholder="探店地址（与门店名称匹配）"
                      className="w-full rounded border border-gray-200 px-2 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>
              <div>
                <span className="mb-2 block text-sm font-medium text-gray-700">
                  达人标签 <span className="text-red-500">*</span>
                </span>
                <p className="mb-2 text-xs text-gray-500">与上方行业类目同源（一级类目），可多选</p>
                <div className="flex flex-wrap gap-2">
                  {categoryOptions.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggle(talentTags, t, setTalentTags)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs',
                        talentTags.includes(t) ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 text-gray-700',
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <span className="mb-2 block text-sm font-medium text-gray-700">粉丝量级（可多选）</span>
                <div className="flex flex-wrap gap-2">
                  {FOLLOWER_TIER_OPTS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggle(followerTiers, t, setFollowerTiers)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs',
                        followerTiers.includes(t) ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 text-gray-700',
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <span className="mb-2 block text-sm font-medium text-gray-700">带货等级（可多选）</span>
                <div className="flex flex-wrap gap-2">
                  {COMMERCE_LEVEL_OPTS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggle(commerceLevels, t, setCommerceLevels)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs',
                        commerceLevels.includes(t) ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 text-gray-700',
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mb-6 border-t border-gray-100 pt-4">
              <p className="mb-2 text-sm font-medium text-gray-800">3 达人Brief</p>
              <p className="mb-3 text-xs text-gray-500">请选择达人Brief，用于指导达人内容创作（来自 Brief 生成记录）。</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-gray-700">
                  {selectedBrief ? (
                    <span>
                      已选：{selectedBrief.mainProductName} · 版本 {String.fromCharCode(65 + selectedBrief.variantIndex)}
                    </span>
                  ) : (
                    <span className="text-amber-700">尚未选择 Brief</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setBriefPickerOpen(true)}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  选择Brief
                </button>
              </div>
              {selectedBrief ? (
                <pre className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-800">
                  {selectedBrief.text.slice(0, 800)}
                  {selectedBrief.text.length > 800 ? '…' : ''}
                </pre>
              ) : null}
            </div>

            <div className="mb-6 border-t border-gray-100 pt-4">
              <p className="mb-3 text-sm font-medium text-gray-800">4 预算与合作</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-600">
                    总预算 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={budget || ''}
                    onChange={(e) => setBudget(Number(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="¥"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">
                    招募人数 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={headcount || ''}
                    onChange={(e) => setHeadcount(Number(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <label className="mt-3 block text-sm font-medium text-gray-700">其他需求</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="补充说明、注意事项等" />
            </div>

            {pushErr ? <p className="mb-3 text-sm text-red-600">{pushErr}</p> : null}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  const draft: RecruitmentCreateDraftV1 = {
                    v: 1,
                    name,
                    recruitMode,
                    designatedInput,
                    platforms,
                    contentTypes,
                    recruitStart,
                    recruitEnd,
                    visitStart,
                    visitEnd,
                    visitSlots,
                    merchantCommissionPct: parseCommissionPctFromDraft(commissionInput),
                    industry,
                    provideMeal,
                    tablePerMeal,
                    stores,
                    talentTags,
                    followerTiers,
                    commerceLevels,
                    budget,
                    headcount,
                    note,
                  }
                  try {
                    window.localStorage.setItem(RECRUITMENT_CREATE_DRAFT_KEY, JSON.stringify(draft))
                    window.alert('草稿已保存到本机浏览器，下次进入本页将自动还原。')
                  } catch {
                    window.alert('保存失败：浏览器可能禁止写入本地存储。')
                  }
                }}
                className="rounded-lg border border-gray-300 px-6 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                保存草稿
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submit()}
                className="inline-flex items-center rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                提交需求
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 font-semibold text-gray-900">需求预览</h3>
              <div className="space-y-3 text-sm">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">招募名称</p>
                  <p className="font-medium text-gray-900">{name || '—'}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">招募模式</p>
                  <p className="text-gray-800">
                    {recruitMode === 'ai' ? 'AI 智能匹配' : `指定达人：${designatedInput.trim() || '（未填写）'}`}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">探店时间</p>
                  <p className="text-gray-800">{visitStart && visitEnd ? `${visitStart} ~ ${visitEnd}` : '—'}</p>
                  <p className="mt-1 text-xs text-gray-500">{visitSlots.join('、')}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">商家提供佣金率</p>
                  <p className="font-medium text-gray-900">{parseCommissionPctFromDraft(commissionInput)}%</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">门店信息</p>
                  <p className="text-gray-800">{stores.filter((s) => s.name.trim()).length} 家门店</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">达人条件</p>
                  <p className="text-xs text-gray-600">标签：{talentTags.length ? talentTags.join('、') : '—'}</p>
                  <p className="mt-1 text-xs text-gray-600">粉丝量级：{followerTiers.length ? followerTiers.join('、') : '—'}</p>
                  <p className="mt-1 text-xs text-gray-600">带货等级：{commerceLevels.length ? commerceLevels.join('、') : '—'}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">达人Brief</p>
                  <p className="text-gray-800">{selectedBrief ? `已选（${selectedBrief.mainProductName}）` : '—'}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">预算/人数</p>
                  <p className="font-medium text-gray-900">
                    ¥ {budget} / {headcount} 人
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {designatedOpen ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">指定达人</h3>
            <p className="mt-1 text-sm text-gray-600">请输入达人昵称或达人 ID</p>
            <input
              value={designatedInput}
              onChange={(e) => setDesignatedInput(e.target.value)}
              placeholder="昵称或 ID"
              className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDesignatedOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!designatedInput.trim()) {
                    window.alert('请填写达人昵称或达人 ID')
                    return
                  }
                  setRecruitMode('designated')
                  setDesignatedOpen(false)
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {briefPickerOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">选择 Brief</h3>
              <button type="button" className="text-gray-500 hover:text-gray-800" onClick={() => setBriefPickerOpen(false)}>
                关闭
              </button>
            </div>
            {briefRecords.length === 0 ? (
              <p className="text-sm text-gray-600">暂无记录。请先在首页 Brief 流程中生成并保存。</p>
            ) : (
              <ul className="space-y-4">
                {briefRecords.map((rec) => (
                  <li key={rec.id} className="rounded-lg border border-gray-200 p-3">
                    <p className="font-medium text-gray-900">{rec.mainProductName}</p>
                    <p className="text-xs text-gray-500">
                      {rec.platform} · {new Date(rec.createdAt).toLocaleString('zh-CN', { hour12: false })}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {([0, 1, 2] as const).map((idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => pickBriefFromRecord(rec, idx)}
                          className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-800 hover:bg-blue-100"
                        >
                          选版本 {String.fromCharCode(65 + idx)}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <MeooPayQrModal
        open={recruitRechargeOpen}
        title="招募预算充值"
        mode="recharge"
        initialRechargeYuan={recruitRechargePrefillYuan}
        rechargeContextHint={
          recruitRechargePrefillYuan.trim()
            ? `账户余额不足以覆盖招募总预算。请按总预算等额充值 ¥${Number(recruitRechargePrefillYuan.replace(/,/g, '')).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}（已填入自定义金额，可依实际微调）；完成支付申报后继续提交需求。`
            : null
        }
        onClose={() => setRecruitRechargeOpen(false)}
        onCompletedPayment={(p) => void onRecruitmentRechargePaid(p)}
      />
    </div>
  )
}

export default function RecruitmentPage() {
  const [screen, setScreen] = useState<
    'hub' | 'createPick' | 'createNovice' | 'createPro' | 'confirm' | 'schedule' | 'review' | 'payment'
  >('hub')
  const [briefOpen, setBriefOpen] = useState(false)
  const [briefTick, setBriefTick] = useState(0)
  const [briefWizardIndustry, setBriefWizardIndustry] = useState('餐饮')
  const [briefIndustryOptions, setBriefIndustryOptions] = useState<string[]>(['餐饮'])
  const [briefDetail, setBriefDetail] = useState<KolBriefRecord | null>(null)
  const [briefDetailVariant, setBriefDetailVariant] = useState<0 | 1 | 2>(0)
  const [hubOrder, setHubOrder] = useState<RegistryRecruitmentOrder | null>(null)
  const [hubOrderLoading, setHubOrderLoading] = useState(false)
  const [hubOrderErr, setHubOrderErr] = useState<string | null>(null)
  const [hubOrderFetchNonce, setHubOrderFetchNonce] = useState(0)

  const refreshHubOrder = useCallback(() => setHubOrderFetchNonce((n) => n + 1), [])

  useEffect(() => {
    if (screen !== 'hub') return
    let cancelled = false
    setHubOrderLoading(true)
    setHubOrderErr(null)
    void (async () => {
      try {
        let lastId = ''
        try {
          lastId = window.localStorage.getItem('meoo_last_recruitment_order_id')?.trim() ?? ''
        } catch {
          lastId = ''
        }
        if (!lastId) {
          if (!cancelled) {
            setHubOrder(null)
            setHubOrderLoading(false)
          }
          return
        }
        const reg = await fetchOpsRegistry()
        if (cancelled) return
        const orders = reg.recruitmentOrders ?? []
        const found = orders.find((o) => o.id === lastId) ?? null
        setHubOrder(found)
        setHubOrderLoading(false)
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e)
          setHubOrderErr(msg.length > 220 ? `${msg.slice(0, 220)}…` : msg)
          setHubOrder(null)
          setHubOrderLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [screen, hubOrderFetchNonce])

  useEffect(() => {
    let on = true
    void (async () => {
      const opts = await loadRecruitmentIndustryL1Labels()
      if (!on) return
      setBriefIndustryOptions(opts)
      setBriefWizardIndustry((prev) => (opts.includes(prev) ? prev : opts[0] ?? '餐饮'))
    })()
    return () => {
      on = false
    }
  }, [])

  const refreshBriefs = useCallback(() => setBriefTick((x) => x + 1), [])
  const briefRecords = useMemo(() => {
    void briefTick
    return readKolBriefRecords()
  }, [briefTick])

  const hubStoredOrderId = useMemo(() => {
    if (screen !== 'hub') return ''
    try {
      return window.localStorage.getItem('meoo_last_recruitment_order_id')?.trim() ?? ''
    } catch {
      return ''
    }
  }, [screen, hubOrderFetchNonce])

  if (screen === 'createPick')
    return (
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-6">
        <button
          type="button"
          onClick={() => setScreen('hub')}
          className="flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          返回招募管理
        </button>
        <div>
          <h1 className="erp-page-title">选择发布方式</h1>
          <p className="mt-2 text-sm text-gray-500">新手版侧重极简填单与 AI 档位分配；专业版保留完整 Brief、门店与达人条件配置。</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setScreen('createNovice')}
            className="group flex flex-col rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-6 text-left shadow-sm transition-all hover:border-violet-400 hover:shadow-md"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg">
              <Sparkles className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">新手版（AI 纯智能处理）</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">
              仅需城市、行业、套餐说明、总预算与招募/探店时间；AI 按同城达人成本习惯输出 V3 / V4 / V5 / V5+ 人数，并支持三种档位偏好策略。
            </p>
            <span className="mt-4 flex items-center text-sm font-medium text-violet-700 group-hover:translate-x-0.5">
              进入新手发布 <ArrowRight className="ml-1 h-4 w-4" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => setScreen('createPro')}
            className="group flex flex-col rounded-2xl border-2 border-blue-200 bg-white p-6 text-left shadow-sm transition-all hover:border-blue-400 hover:shadow-md"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg">
              <GraduationCap className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">专业版（AI 辅助处理）</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">
              完整流程：Brief、门店同步、达人标签与粉丝/带货筛选、佣金率等；适合需要精细控制的团队。
            </p>
            <span className="mt-4 flex items-center text-sm font-medium text-blue-700 group-hover:translate-x-0.5">
              进入专业发布 <ArrowRight className="ml-1 h-4 w-4" />
            </span>
          </button>
        </div>
      </div>
    )
  if (screen === 'createNovice') return <NoviceRecruitmentForm onBack={() => setScreen('createPick')} />
  if (screen === 'createPro') return <CreateForm onBack={() => setScreen('createPick')} />
  if (screen === 'confirm') return <RecruitmentTalentPoolView onBack={() => setScreen('hub')} />
  if (screen === 'schedule')
    return <RecruitmentScheduleView onBack={() => setScreen('hub')} onEnterVideo={() => setScreen('review')} />
  if (screen === 'review') return <RecruitmentVideoReviewView onBack={() => setScreen('hub')} />
  if (screen === 'payment') return <RecruitmentPaymentView onBack={() => setScreen('hub')} />

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <RecruitmentBriefWizard
        open={briefOpen}
        onClose={() => setBriefOpen(false)}
        industry={briefWizardIndustry}
        onSaved={refreshBriefs}
      />

      {briefDetail ? (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-labelledby="kol-brief-detail-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setBriefDetail(null)
          }}
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-6 py-4">
              <div className="min-w-0">
                <h3 id="kol-brief-detail-title" className="text-lg font-semibold text-gray-900">
                  {briefDetail.mainProductName}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  {new Date(briefDetail.createdAt).toLocaleString('zh-CN', { hour12: false })} · {briefDetail.platform}
                  {briefDetail.secondaryProductName ? ` · 次推：${briefDetail.secondaryProductName}` : ''}
                </p>
                {briefDetail.tags.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {briefDetail.tags.map((t) => (
                      <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="shrink-0 text-gray-500 hover:text-gray-800"
                onClick={() => setBriefDetail(null)}
              >
                关闭
              </button>
            </div>
            <div className="border-b border-gray-100 px-6 py-3">
              <p className="mb-2 text-xs font-medium text-gray-600">Brief 正文</p>
              <div className="flex flex-wrap gap-2">
                {([0, 1, 2] as const).map((idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setBriefDetailVariant(idx)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                      briefDetailVariant === idx
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                    )}
                  >
                    版本 {String.fromCharCode(65 + idx)}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[55vh] overflow-y-auto px-6 py-4">
              <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">
                {briefDetail.previews[briefDetailVariant] || '（暂无正文）'}
              </pre>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="erp-page-title">达人招募管理</h1>
          <p className="mt-1 text-sm text-gray-500">一站式达人招募、排期、审核与结算管理</p>
        </div>
        <button
          type="button"
          onClick={() => setScreen('createPick')}
          className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          发布招募需求
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {FLOW.map((e, t) => {
          const Icon = e.icon
          return (
            <motion.div
              key={e.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * t }}
              role="button"
              tabIndex={0}
              onClick={() => setScreen(e.view)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') setScreen(e.view)
              }}
              className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-5 transition-all hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${e.color}`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <span className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700">进行中</span>
              </div>
              <h4 className="mb-2 font-semibold text-gray-900">{e.title}</h4>
              <p className="mb-4 line-clamp-2 text-sm text-gray-500">{e.desc}</p>
              <span className="flex items-center text-sm text-blue-600 transition-transform group-hover:translate-x-1">
                进入 <ArrowRight className="ml-1 h-4 w-4" />
              </span>
            </motion.div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-semibold text-gray-900">AI达人Brief智能生成</h4>
            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">智能辅助</span>
          </div>
          <p className="mb-4 text-sm text-gray-500">选择主推品、次推品及商品标签，AI 生成 3 版达人合作 Brief，可保存到记录并在「发布招募」中引用。</p>
          <label className="mb-2 block text-xs font-medium text-gray-600">Brief 标签所用行业（影响「按行业 AI 获取标签」）</label>
          <select
            value={briefWizardIndustry}
            onChange={(e) => setBriefWizardIndustry(e.target.value)}
            className="mb-3 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
          >
            {briefIndustryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setBriefOpen(true)}
            className="flex w-full items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            进入Brief生成
          </button>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold text-gray-900">查看订单</h4>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">招募进度</span>
              <button
                type="button"
                onClick={() => refreshHubOrder()}
                disabled={hubOrderLoading}
                className="inline-flex items-center rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className={cn('mr-1 h-3.5 w-3.5', hubOrderLoading && 'animate-spin')} />
                刷新
              </button>
            </div>
          </div>
          <p className="mb-4 text-sm text-gray-500">
            展示本机最近一次提交的招募订单在运营侧的状态，并与主流程环节对齐（数据来自运营注册表同步，可点刷新更新）。
          </p>
          {hubOrderLoading ? (
            <p className="text-sm text-gray-500">正在加载订单…</p>
          ) : hubOrderErr ? (
            <div className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-2 text-sm text-red-700">
              <p>{hubOrderErr}</p>
              <button type="button" className="mt-2 text-xs font-medium text-red-800 underline" onClick={() => refreshHubOrder()}>
                重试
              </button>
            </div>
          ) : !hubStoredOrderId ? (
            <p className="text-sm text-gray-500">
              提交招募需求后，将在此显示订单号与各环节进度。请先通过「发布招募需求」完成一次新手版或专业版提单。
            </p>
          ) : !hubOrder ? (
            <p className="text-sm text-amber-800">
              已记录本机最近订单号，但在运营注册表中未找到对应条目（可能尚未同步或订单已清理）。可稍后点击「刷新」重试。
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 pb-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">订单号</p>
                  <p className="mt-0.5 truncate font-mono text-sm font-semibold text-gray-900">{hubOrder.id}</p>
                </div>
                <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">
                  {recruitmentOrderStatusLabel(hubOrder.status)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-gray-500">招募预算</p>
                  <p className="font-medium text-gray-900">¥{Number(hubOrder.serviceAmount).toLocaleString('zh-CN')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">达人佣金</p>
                  <p className="font-medium text-gray-900">{hubOrder.commissionPct}%</p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-xs text-gray-500">预估结算净值</p>
                  <p className="font-medium text-gray-900">¥{Number(hubOrder.netAmount).toLocaleString('zh-CN')}</p>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-gray-600">环节进度</p>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {buildRecruitmentProgressSteps(hubOrder.status).map((step, idx) => (
                    <div
                      key={`${step.title}-${idx}`}
                      className={cn(
                        'min-w-[5.5rem] flex-1 rounded-lg border px-2 py-2 text-center',
                        step.done && 'border-emerald-200 bg-emerald-50/80',
                        step.current && !step.done && 'border-blue-400 bg-blue-50 ring-1 ring-blue-200',
                        !step.done && !step.current && 'border-gray-100 bg-gray-50/80',
                      )}
                    >
                      <p className="text-[10px] font-medium text-gray-500">第 {idx + 1} 步</p>
                      <p className="mt-0.5 text-xs font-semibold leading-tight text-gray-900">{step.title}</p>
                      <p className="mt-1 line-clamp-2 text-[10px] text-gray-500">{step.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-semibold text-gray-900">达人Brief记录</h4>
          <span className="text-xs text-gray-500">共 {briefRecords.length} 条</span>
        </div>
        {briefRecords.length === 0 ? (
          <p className="text-sm text-gray-500">暂无，请使用上方「进入Brief生成」。</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {briefRecords.map((rec) => (
              <li key={rec.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium text-gray-900">{rec.mainProductName}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(rec.createdAt).toLocaleDateString('zh-CN')} · {rec.platform}
                    {rec.secondaryProductName ? ` · ${rec.secondaryProductName}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="flex items-center text-blue-600 hover:underline"
                    onClick={() => {
                      setBriefDetailVariant(0)
                      setBriefDetail(rec)
                    }}
                  >
                    <Eye className="mr-1 inline h-4 w-4" />
                    查看
                  </button>
                  <button
                    type="button"
                    className="flex items-center text-red-600 hover:underline"
                    onClick={() => {
                      const next = readKolBriefRecords().filter((x) => x.id !== rec.id)
                      writeKolBriefRecords(next)
                      setBriefDetail((d) => (d?.id === rec.id ? null : d))
                      refreshBriefs()
                    }}
                  >
                    <Trash2 className="mr-1 inline h-4 w-4" />
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
