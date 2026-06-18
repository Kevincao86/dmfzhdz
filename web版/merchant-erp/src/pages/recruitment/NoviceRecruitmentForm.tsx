import { ChevronLeft, Plus, RefreshCw, Search, Sparkles, Store } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MeooPayQrModal from '../../components/MeooPayQrModal'
import RecruitmentCityPickerModal, {
  RecruitmentCityField,
} from '../../components/recruitment/RecruitmentCityPickerModal'
import DouyinStorePickerModal from '../../components/store/DouyinStorePickerModal'
import { cn } from '../../cn'
import { buildErpRegistryTenant } from '../../lib/buildErpRegistryTenant'
import { DB_MIGRATION_HINT_ZH, shouldSuggestDbMigration } from '../../lib/dbSchemaErrorHint'
import { readMerchantSession } from '../../lib/merchantSession'
import {
  formatCityTierBandsLines,
  resolveCityKolTierBands,
  type CityKolTierBands,
} from '../../lib/recruitmentCityTierPricing'
import {
  formatRecruitmentCitySummary,
  hasRecruitmentCitySelection,
  primaryRecruitmentCity,
} from '../../lib/recruitmentCityPicker'
import { loadRecruitmentIndustryL1Labels } from '../../lib/recruitmentIndustryOptions'
import { buildRecruitmentTierPlan } from '../../lib/merchantRecruitmentTierPlan'
import { SHOW_NOVICE_CITY_TIER_COST_REF } from '../../lib/recruitmentNoviceUiFlags'
import { submitMerchantRecruitmentWithMpPublish } from '../../lib/merchantRecruitmentSubmit'
import type { RegistryRecruitmentOrder } from '../../lib/opsRegistryTypes'
import { resolveRecruitmentOrderTenantMeta } from '../../lib/recruitmentOrderMeta'
import { tenantLocalKey } from '../../lib/tenantLocalState'
import { supabase, supabaseConfigured } from '../../lib/supabaseClient'
import { fetchPrimaryTenantId, fetchTenantWalletSummary, insertMerchantPaymentOrder } from '../../lib/tenantBilling'
import {
  listChainBrandOptions,
  type BrandGroupStore,
} from '../../lib/storeBrandGroup'
import {
  LOCAL_LIFE_KOL_COMMISSION_DEFAULT_PCT,
  LOCAL_LIFE_KOL_COMMISSION_MAX_PCT,
  LOCAL_LIFE_KOL_COMMISSION_MIN_PCT,
} from '../../lib/localLifeKolCommission'
import {
  fallbackXiaohongshuNoviceAllocation,
  generateNoviceKolAllocation,
  resolveCityKolTierBandsSmart,
  type CityTierBandsSource,
  type NoviceAllocation,
} from '../../services/recruitmentNoviceAllocationAi'
import { getDouyinStores } from '../../services/douyinMerchantApi'

type SelectedStore = { id: string; name: string; address?: string }

const NOVICE_PLATFORMS = ['抖音', '小红书'] as const
type NoviceDeliveryPlatform = (typeof NOVICE_PLATFORMS)[number]

function formatBudgetYuanForPrefill(yuan: number): string {
  if (!Number.isFinite(yuan) || yuan <= 0) return ''
  const cents = Math.round(yuan * 100)
  return String(cents / 100)
}

function filterKolCommissionInputDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 3)
}

function parseKolCommissionPctFromDraft(draft: string): number {
  const d = draft.replace(/\D/g, '')
  if (!d) return 0
  const n = parseInt(d, 10)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(80, n))
}

type Props = {
  onBack: () => void
}

export default function NoviceRecruitmentForm({ onBack }: Props) {
  const [deliveryPlatform, setDeliveryPlatform] = useState<NoviceDeliveryPlatform>('抖音')
  const [cityNational, setCityNational] = useState(false)
  const [selectedCities, setSelectedCities] = useState<string[]>([])
  const [cityPickerOpen, setCityPickerOpen] = useState(false)
  const [industry, setIndustry] = useState('餐饮')
  const [industryOptions, setIndustryOptions] = useState<string[]>(['餐饮'])
  const [packageNote, setPackageNote] = useState('')
  const [budget, setBudget] = useState(0)
  const [recruitStart, setRecruitStart] = useState('')
  const [recruitEnd, setRecruitEnd] = useState('')
  const [visitStart, setVisitStart] = useState('')
  const [visitEnd, setVisitEnd] = useState('')
  const [kolCommissionInput, setKolCommissionInput] = useState(String(LOCAL_LIFE_KOL_COMMISSION_DEFAULT_PCT))

  const [selectedStores, setSelectedStores] = useState<SelectedStore[]>([])
  const [storePickerOpen, setStorePickerOpen] = useState(false)
  const [storesBoundHint, setStoresBoundHint] = useState<string | null>(null)
  const [boundStores, setBoundStores] = useState<BrandGroupStore[]>([])
  const [storeQuickFilter, setStoreQuickFilter] = useState('')
  const [manualStoreDraft, setManualStoreDraft] = useState('')
  const [brandName, setBrandName] = useState('')
  const [brandManualMode, setBrandManualMode] = useState(false)
  const autoAllocTimerRef = useRef<number | null>(null)

  const [cityTierBands, setCityTierBands] = useState<CityKolTierBands | null>(null)
  const [cityTierSource, setCityTierSource] = useState<CityTierBandsSource | null>(null)
  const [cityTierLoading, setCityTierLoading] = useState(false)

  const [feeType, setFeeType] = useState<'tier' | 'fixed'>('tier')
  const [targetHeadcount, setTargetHeadcount] = useState(0)
  const [allocation, setAllocation] = useState<NoviceAllocation | null>(null)
  const [allocationFresh, setAllocationFresh] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiErr, setAiErr] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [pushErr, setPushErr] = useState<string | null>(null)
  const [recruitRechargeOpen, setRecruitRechargeOpen] = useState(false)
  const [recruitRechargePrefillYuan, setRecruitRechargePrefillYuan] = useState('')
  const skipRecruitmentWalletCheckRef = useRef(false)

  useEffect(() => {
    let on = true
    void (async () => {
      const opts = await loadRecruitmentIndustryL1Labels()
      if (!on) return
      setIndustryOptions(opts)
      setIndustry((prev) => (opts.includes(prev) ? prev : opts[0] ?? '餐饮'))
    })()
    return () => {
      on = false
    }
  }, [])

  useEffect(() => {
    setAllocationFresh(false)
  }, [
    cityNational,
    selectedCities,
    industry,
    packageNote,
    budget,
    recruitStart,
    recruitEnd,
    visitStart,
    visitEnd,
    kolCommissionInput,
    deliveryPlatform,
    selectedStores,
    brandName,
    cityTierBands,
    targetHeadcount,
    feeType,
  ])

  const isDouyin = deliveryPlatform === '抖音'
  const citySummary = formatRecruitmentCitySummary(cityNational, selectedCities)
  const primaryCity = primaryRecruitmentCity(cityNational, selectedCities)
  const hasCity = hasRecruitmentCitySelection(cityNational, selectedCities)

  const tierBandLines = useMemo(
    () => (cityTierBands ? formatCityTierBandsLines(cityTierBands) : []),
    [cityTierBands],
  )

  useEffect(() => {
    const tok = readMerchantSession('meoo_douyin_merchant_token')
    if (!tok) {
      setStoresBoundHint('请先在「系统设置」绑定抖音来客，以便同步门店；也可手动输入门店名称')
      setBoundStores([])
      return
    }
    setStoresBoundHint(null)
    let cancelled = false
    void (async () => {
      try {
        const r = await getDouyinStores({
          accessToken: tok,
          merchantId: readMerchantSession('meoo_douyin_merchant_id') ?? undefined,
          page: 1,
          pageSize: 100,
          claimScope: 'claimed',
          relationType: 'all',
        })
        if (cancelled || !r.ok) return
        setBoundStores(
          r.items.map((x) => ({
            id: x.id,
            name: x.name,
            address: x.address,
            city: x.city,
            brandName: x.brandName,
          })),
        )
      } catch {
        if (!cancelled) setBoundStores([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const brandOptions = useMemo(
    () => listChainBrandOptions(boundStores),
    [boundStores],
  )

  const quickStoreHits = useMemo(() => {
    const q = storeQuickFilter.trim().toLowerCase()
    if (!q || boundStores.length === 0) return []
    return boundStores
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.address?.toLowerCase().includes(q) ||
          s.brandName?.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [boundStores, storeQuickFilter])

  const addManualStore = () => {
    const name = manualStoreDraft.trim()
    if (!name) return
    const id = `manual:${Date.now()}`
    setSelectedStores((prev) => {
      if (prev.some((s) => s.name === name)) return prev
      return [...prev, { id, name }]
    })
    setManualStoreDraft('')
  }

  const addQuickStore = (store: BrandGroupStore) => {
    setSelectedStores((prev) => {
      if (prev.some((s) => s.id === store.id)) return prev
      return [...prev, { id: store.id, name: store.name, address: store.address }]
    })
    setStoreQuickFilter('')
  }

  useEffect(() => {
    if (!SHOW_NOVICE_CITY_TIER_COST_REF || !isDouyin || !hasCity || cityNational || !primaryCity) {
      if (!SHOW_NOVICE_CITY_TIER_COST_REF) {
        setCityTierBands(null)
        setCityTierSource(null)
        setCityTierLoading(false)
      } else if (!isDouyin || !hasCity || cityNational || !primaryCity) {
        setCityTierBands(null)
        setCityTierSource(null)
        setCityTierLoading(false)
      }
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setCityTierLoading(true)
      void resolveCityKolTierBandsSmart({ city: primaryCity, industry })
        .then(({ bands, source }) => {
          if (cancelled) return
          setCityTierBands(bands)
          setCityTierSource(source)
        })
        .catch(() => {
          if (cancelled) return
          setCityTierBands(resolveCityKolTierBands(primaryCity))
          setCityTierSource('static')
        })
        .finally(() => {
          if (!cancelled) setCityTierLoading(false)
        })
    }, 650)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [cityNational, hasCity, industry, isDouyin, primaryCity])

  const runAllocation = useCallback(async () => {
    setAiErr(null)
    if (!hasCity) {
      setAiErr('请选择招募城市，便于按同城达人行情估算档位')
      return
    }
    if (!Number.isFinite(budget) || budget <= 0) {
      setAiErr('请填写总预算（大于 0）')
      return
    }
    if (!targetHeadcount || targetHeadcount < 1) {
      setAiErr('请填写招募人数（目标）')
      return
    }
    setAiLoading(true)
    try {
      let bands = cityTierBands
      let bandsSource = cityTierSource
      if (isDouyin && primaryCity && !cityNational) {
        const resolved = await resolveCityKolTierBandsSmart({ city: primaryCity, industry })
        bands = resolved.bands
        bandsSource = resolved.source
        if (SHOW_NOVICE_CITY_TIER_COST_REF) {
          setCityTierBands(bands)
          setCityTierSource(bandsSource)
        }
      }
      const res = isDouyin
        ? await generateNoviceKolAllocation({
            city: primaryCity,
            industry,
            packageNote,
            budgetYuan: budget,
            targetHeadcount,
            feeType,
            kolCommissionPct: parseKolCommissionPctFromDraft(kolCommissionInput),
            cityTierBands: bands ?? undefined,
          })
        : fallbackXiaohongshuNoviceAllocation(budget)
      setAllocation(res)
      setAllocationFresh(true)
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : '分配失败')
    } finally {
      setAiLoading(false)
    }
  }, [
    budget,
    cityNational,
    cityTierBands,
    cityTierSource,
    feeType,
    hasCity,
    industry,
    isDouyin,
    kolCommissionInput,
    packageNote,
    primaryCity,
    targetHeadcount,
  ])

  useEffect(() => {
    if (!isDouyin || !hasCity || budget <= 0 || targetHeadcount < 1) return
    if (autoAllocTimerRef.current) window.clearTimeout(autoAllocTimerRef.current)
    autoAllocTimerRef.current = window.setTimeout(() => {
      void runAllocation()
    }, 900)
    return () => {
      if (autoAllocTimerRef.current) window.clearTimeout(autoAllocTimerRef.current)
    }
  }, [
    budget,
    cityNational,
    feeType,
    hasCity,
    industry,
    isDouyin,
    kolCommissionInput,
    packageNote,
    primaryCity,
    runAllocation,
    selectedCities,
    targetHeadcount,
  ])

  const submit = async () => {
    setPushErr(null)
    if (selectedStores.length === 0) {
      setPushErr('请至少选择或手动输入一家探店门店')
      return
    }
    if (!hasCity) {
      setPushErr('请选择招募城市')
      return
    }
    if (!Number.isFinite(budget) || budget <= 0) {
      setPushErr('请填写总预算（大于 0）')
      return
    }
    if (!recruitStart.trim() || !recruitEnd.trim()) {
      setPushErr('请填写招募开始与结束时间')
      return
    }
    if (!visitStart.trim() || !visitEnd.trim()) {
      setPushErr('请填写探店开始与结束时间')
      return
    }
    if (!allocation || !allocationFresh) {
      setPushErr(
        isDouyin
          ? '请填写招募城市、总预算与目标人数，等待 AI 按星选达人库自动分配档位（或点击「重新 AI 分配」）'
          : '请先点击「重新估算小红书达人数」，并在修改预算后重新估算',
      )
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
              setRecruitRechargePrefillYuan(formatBudgetYuanForPrefill(budget))
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

    const kolPct = isDouyin ? parseKolCommissionPctFromDraft(kolCommissionInput) : 0
    const tenant = buildErpRegistryTenant()
    const customerName = tenant?.merchantName ?? '灵祺 ERP 商户'
    const storeName = selectedStores.map((s) => s.name).join('、') || citySummary
    const storeAddress =
      selectedStores.map((s) => (s.address?.trim() ? `${s.name}（${s.address.trim()}）` : s.name)).join('；') ||
      `${citySummary} · ${industry}`
    const storeIdsLine = selectedStores.map((s) => s.id).join(',')
    const id = `RO-NV${Date.now()}`
    const headcountForOrder =
      targetHeadcount > 0
        ? targetHeadcount
        : allocation.v3 + allocation.v4 + allocation.v5 + allocation.v5plus
    const tierLine = isDouyin
      ? `V3:${allocation.v3} V4:${allocation.v4} V5:${allocation.v5} V5以上:${allocation.v5plus}`
      : `预估达人数:${headcountForOrder}`
    const tenantMeta = await resolveRecruitmentOrderTenantMeta(supabaseConfigured ? supabase : null)
    const order: RegistryRecruitmentOrder = {
      id,
      ...tenantMeta,
      customerName,
      storeName,
      talentId: '—',
      talentName: '新手版·待 AI / 运营匹配',
      fans: headcountForOrder,
      accountType: deliveryPlatform,
      recruitmentPlatform: deliveryPlatform,
      coopTimes: 0,
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      status: 'pending',
      serviceAmount: budget,
      commissionPct: kolPct,
      netAmount: Math.round((Math.max(0, budget) * (100 - kolPct)) / 100),
      storeAddress,
      category: industry,
      infoSummary: `【新手版·AI纯智能】投放平台:${deliveryPlatform}；城市:${citySummary}；${brandName.trim() ? `品牌:${brandName.trim()}；` : ''}门店:${storeName}；POI:${storeIdsLine}；行业:${industry}；套餐:${packageNote.trim().slice(0, 200) || '—'}；预算¥${budget}；${isDouyin ? `达人佣金:${kolPct}%；费用模式:${feeType === 'fixed' ? '一口价' : '阶梯档位'}；目标人数:${headcountForOrder}；` : '达人佣金:不适用(小红书)；'}招募:${recruitStart}~${recruitEnd}；探店:${visitStart}~${visitEnd}；${isDouyin ? `档位:${tierLine}；` : `人数:${tierLine}；`}分配来源:${allocation.source === 'library' ? '星选达人库测算' : allocation.source === 'ai' ? '模型' : '离线估算'}；${allocation.costHint ?? ''}${allocation.notes ? `；说明:${allocation.notes}` : ''}`,
    }

    const tierPlan = buildRecruitmentTierPlan({
      budgetYuan: budget,
      targetHeadcount: headcountForOrder,
      city: primaryCity,
      feeType,
      cityTierBands: cityTierBands ?? undefined,
      source: allocation.source,
      allocation: isDouyin
        ? { v3: allocation.v3, v4: allocation.v4, v5: allocation.v5, v5plus: allocation.v5plus }
        : undefined,
    })

    setSubmitting(true)
    try {
      const enriched: RegistryRecruitmentOrder = {
        ...order,
        fans: headcountForOrder,
        fulfillmentLoop: 'open',
        orderKind: 'recruitment',
        autoPublishMp: true,
        tierPlan,
        workflowStage: 'submitted',
      }
      const { mpOrderId } = await submitMerchantRecruitmentWithMpPublish(enriched, tierPlan)
      try {
        window.localStorage.setItem(tenantLocalKey('meoo_last_recruitment_order_id'), id)
      } catch {
        /* ignore */
      }
      window.alert(`AI 招募方案已生成并发布至星选大厅（${mpOrderId}）。达人报名后请在「达人反选」中按档位确认。`)
      onBack()
    } catch (e) {
      const detail = e instanceof Error ? e.message.trim() : String(e)
      setPushErr(
        detail
          ? `推送失败：${detail.length > 280 ? `${detail.slice(0, 280)}…` : detail}`
          : '推送失败：请确认网络正常，且运营侧服务与数据同步已就绪。',
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        返回版本选择
      </button>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-md">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">新手版 · AI 纯智能处理</h1>
            <p className="mt-1 text-sm text-gray-500">
              选择品牌（可选）、门店（可筛选或手动输入）、城市与行业后，填写招募人数与总预算；AI 将按星选达人库同城价格自动分配 V3–V5+ 档位。
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <span className="mb-2 block text-xs font-medium text-gray-600">
              投放平台 <span className="text-red-500">*</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {NOVICE_PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setDeliveryPlatform(p)
                    setAllocation(null)
                    setAllocationFresh(false)
                  }}
                  className={cn(
                    'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                    deliveryPlatform === p
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            {!isDouyin ? (
              <p className="mt-1 text-xs text-amber-700">
                小红书不展示达人佣金与抖音带货档位；运营接单后可下发小红书报名表单。
              </p>
            ) : null}
          </div>

          {isDouyin ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                品牌 <span className="font-normal text-gray-400">（选填，连锁统筹时可填）</span>
              </label>
              {brandManualMode || brandOptions.length === 0 ? (
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="可手动输入品牌名称"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              ) : (
                <select
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">不指定品牌</option>
                  {brandOptions.map((b) => (
                    <option key={b.brandKey} value={b.brandName}>
                      {b.brandName}（{b.storeCount} 家门店）
                    </option>
                  ))}
                </select>
              )}
              {brandOptions.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setBrandManualMode((v) => !v)}
                  className="mt-1 text-xs text-blue-700 underline"
                >
                  {brandManualMode ? '从已绑定门店品牌中选择' : '改用手动输入品牌'}
                </button>
              ) : null}
            </div>
          ) : null}

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-gray-600">
                探店门店 <span className="text-red-500">*</span>
                <span className="ml-1 font-normal text-gray-400">（可筛选绑定门店、可手动输入）</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  const tok = readMerchantSession('meoo_douyin_merchant_token')
                  if (!tok) {
                    setStoresBoundHint('未绑定来客时可直接在下方手动输入门店名称')
                  }
                  setStorePickerOpen(true)
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100"
              >
                <Store className="h-3.5 w-3.5" />
                从绑定门店选择
              </button>
            </div>
            {storesBoundHint ? <p className="mb-2 text-xs text-amber-700">{storesBoundHint}</p> : null}
            <div className="mb-2 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  value={storeQuickFilter}
                  onChange={(e) => setStoreQuickFilter(e.target.value)}
                  placeholder="筛选已绑定门店（名称/地址/品牌）"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm"
                />
              </div>
            </div>
            {quickStoreHits.length > 0 ? (
              <ul className="mb-2 max-h-36 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/80 text-xs">
                {quickStoreHits.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => addQuickStore(s)}
                      className="flex w-full flex-col px-3 py-2 text-left hover:bg-blue-50"
                    >
                      <span className="font-medium text-gray-900">{s.name}</span>
                      {s.address ? <span className="text-gray-500">{s.address}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mb-2 flex gap-2">
              <input
                value={manualStoreDraft}
                onChange={(e) => setManualStoreDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addManualStore()
                  }
                }}
                placeholder="手动输入门店名称后添加"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={addManualStore}
                className="inline-flex shrink-0 items-center rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Plus className="mr-1 h-4 w-4" />
                添加
              </button>
            </div>
            {selectedStores.length > 0 ? (
              <div className="mb-1 flex flex-wrap gap-2">
                {selectedStores.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-800"
                  >
                    <span className="truncate">{s.name}</span>
                    {s.id.startsWith('manual:') ? (
                      <span className="shrink-0 text-[10px] text-amber-700">手动</span>
                    ) : null}
                    <button
                      type="button"
                      className="shrink-0 text-slate-400 hover:text-red-600"
                      aria-label={`移除 ${s.name}`}
                      onClick={() => setSelectedStores((prev) => prev.filter((x) => x.id !== s.id))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">请筛选选择、从绑定列表勾选，或手动输入门店名称</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              招募城市 <span className="text-red-500">*</span>
            </label>
            <RecruitmentCityField
              cityNational={cityNational}
              selectedCities={selectedCities}
              onClick={() => setCityPickerOpen(true)}
            />
            {SHOW_NOVICE_CITY_TIER_COST_REF && isDouyin && hasCity && !cityNational && primaryCity ? (
              <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2 text-xs text-indigo-900">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <p className="font-medium text-indigo-950">星选达人库 · 同城档位参考成本（元/人次，估算）</p>
                  {cityTierLoading ? (
                    <span className="inline-flex items-center gap-1 text-indigo-700">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      AI 分析中…
                    </span>
                  ) : cityTierSource === 'ai' ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                      AI 估算
                    </span>
                  ) : cityTierSource === 'static' ? (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      默认参考
                    </span>
                  ) : null}
                </div>
                {tierBandLines.length ? (
                  <ul className="list-inside list-disc space-y-0.5 text-indigo-900/90">
                    {tierBandLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : cityTierLoading ? (
                  <p className="text-indigo-800/80">正在根据城市与行业估算各档位单次成本…</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              行业 <span className="text-red-500">*</span>
            </label>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {industryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">套餐 / 项目说明（供 AI 理解撮合成本）</label>
            <input
              value={packageNote}
              onChange={(e) => setPackageNote(e.target.value)}
              placeholder="例如：双人火锅套餐、美甲单次体验…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              总预算（元） <span className="text-red-500">*</span>
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

          {isDouyin ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                达人佣金（%） <span className="text-red-500">*</span>
              </label>
              <input
                inputMode="numeric"
                value={kolCommissionInput}
                onChange={(e) => setKolCommissionInput(filterKolCommissionInputDigits(e.target.value))}
                onBlur={() => setKolCommissionInput(String(parseKolCommissionPctFromDraft(kolCommissionInput)))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder={`例如：${LOCAL_LIFE_KOL_COMMISSION_DEFAULT_PCT}`}
              />
              <p className="mt-1 text-xs text-gray-500">
                当前有效：{parseKolCommissionPctFromDraft(kolCommissionInput)}%（0～80；本地生活纯佣金常见{' '}
                {LOCAL_LIFE_KOL_COMMISSION_MIN_PCT}～{LOCAL_LIFE_KOL_COMMISSION_MAX_PCT}%，默认{' '}
                {LOCAL_LIFE_KOL_COMMISSION_DEFAULT_PCT}%）
              </p>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                招募开始 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={recruitStart}
                onChange={(e) => setRecruitStart(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                招募结束 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={recruitEnd}
                onChange={(e) => setRecruitEnd(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                探店开始 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={visitStart}
                onChange={(e) => setVisitStart(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                探店结束 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={visitEnd}
                onChange={(e) => setVisitEnd(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-gray-800">
                招募人数（目标） <span className="text-red-500">*</span>
              </span>
              <input
                type="number"
                min={1}
                value={targetHeadcount || ''}
                onChange={(e) => setTargetHeadcount(Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
                placeholder="如 20"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            {isDouyin ? (
              <div className="block text-sm">
                <span className="font-medium text-gray-800">费用模式</span>
                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setFeeType('tier')}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm',
                      feeType === 'tier' ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200',
                    )}
                  >
                    阶梯档位
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeeType('fixed')}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm',
                      feeType === 'fixed' ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200',
                    )}
                  >
                    一口价
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              disabled={aiLoading}
              onClick={() => void runAllocation()}
              className="inline-flex items-center rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:brightness-105 disabled:opacity-50"
            >
              {aiLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {isDouyin ? '重新 AI 分配达人档位' : '重新估算小红书达人数'}
            </button>
            {aiLoading ? (
              <span className="text-xs text-indigo-700">正在按星选达人库价格测算…</span>
            ) : null}
            {!allocationFresh && allocation ? (
              <span className="text-xs text-amber-600">表单已变更，请重新分配</span>
            ) : null}
          </div>

          {aiErr ? <p className="text-sm text-red-600">{aiErr}</p> : null}

          {allocation ? (
            <div
              className={cn(
                'rounded-xl border p-4',
                allocation.source === 'library' || allocation.source === 'ai'
                  ? 'border-emerald-200 bg-emerald-50/50'
                  : 'border-gray-200 bg-gray-50',
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">
                  {isDouyin ? '达人档位分配结果' : '小红书达人数估算'}
                </p>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    allocation.source === 'library' || allocation.source === 'ai'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-gray-200 text-gray-700',
                  )}
                >
                  {allocation.source === 'library'
                    ? '星选达人库'
                    : allocation.source === 'ai'
                      ? 'AI 模型'
                      : '离线估算'}
                </span>
              </div>
              {isDouyin ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(
                    [
                      ['V3', allocation.v3, cityTierBands?.v3],
                      ['V4', allocation.v4, cityTierBands?.v4],
                      ['V5', allocation.v5, cityTierBands?.v5],
                      ['V5以上', allocation.v5plus, cityTierBands?.v5plus],
                    ] as const
                  ).map(([label, n, band]) => (
                    <div key={label} className="rounded-lg bg-white/80 px-3 py-2 text-center shadow-sm ring-1 ring-black/5">
                      <p className="text-sm font-semibold tracking-wide text-gray-800">{label}</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{n}</p>
                      <p className="text-[10px] text-gray-500">人</p>
                      {band ? (
                        <p className="mt-1 text-[10px] leading-tight text-gray-500">
                          参考 {band.max == null ? `${band.min}+` : `${band.min}–${band.max}`} 元/人次
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-white/80 px-4 py-4 text-center shadow-sm ring-1 ring-black/5">
                  <p className="text-sm font-medium text-gray-700">预估招募达人数</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
                    {allocation.v3 + allocation.v4 + allocation.v5 + allocation.v5plus}
                  </p>
                  <p className="text-xs text-gray-500">人（按总预算估算）</p>
                </div>
              )}
              {allocation.costHint ? <p className="mt-3 text-xs text-gray-600">{allocation.costHint}</p> : null}
              {allocation.notes ? <p className="mt-1 text-xs text-gray-500">{allocation.notes}</p> : null}
            </div>
          ) : null}

          {pushErr ? <p className="text-sm text-red-600">{pushErr}</p> : null}

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-gray-300 px-6 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              取消
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

      <RecruitmentCityPickerModal
        open={cityPickerOpen}
        value={{ cityNational, selectedCities }}
        onClose={() => setCityPickerOpen(false)}
        onConfirm={(next) => {
          setCityNational(next.cityNational)
          setSelectedCities(next.selectedCities)
        }}
      />

      <DouyinStorePickerModal
        open={storePickerOpen}
        onClose={() => setStorePickerOpen(false)}
        initialPoiIds={selectedStores.map((s) => s.id)}
        onConfirm={(poiIds, rows) => {
          void (async () => {
            const tok = readMerchantSession('meoo_douyin_merchant_token')
            let next: SelectedStore[] = poiIds.map((id) => ({
              id,
              name: rows.find((r) => r.id === id)?.name ?? id,
            }))
            if (tok) {
              try {
                const r = await getDouyinStores({
                  accessToken: tok,
                  merchantId: readMerchantSession('meoo_douyin_merchant_id') ?? undefined,
                  page: 1,
                  pageSize: 100,
                  claimScope: 'claimed',
                  relationType: 'all',
                })
                if (r.ok) {
                  next = poiIds.map((id) => {
                    const row = r.items.find((x) => x.id === id)
                    return {
                      id,
                      name: row?.name ?? rows.find((x) => x.id === id)?.name ?? id,
                      address: row?.address,
                    }
                  })
                }
              } catch {
                /* keep picker names */
              }
            }
            setSelectedStores(next)
            setStorePickerOpen(false)
          })()
        }}
      />

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
