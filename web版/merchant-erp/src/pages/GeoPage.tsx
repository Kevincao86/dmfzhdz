import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Database,
  Globe2,
  Link2,
  Loader2,
  MapPin,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Shield,
  Sparkles,
  Stethoscope,
  Store,
  Target,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { cn } from '../cn'
import AiModelAutoPicker from '../components/AiModelAutoPicker'
import {
  AI_ADAPTATION_RULE,
  CONTENT_FRESHNESS,
  CONTENT_LIBRARY_FEATURE,
  CONTENT_LIBRARY_TYPE,
  EFFECT_CHECK_FEATURE,
  GEO_HEALTH_SCORE,
  INFO_COMPLETENESS,
  OPTIMIZE_TODO,
  PLATFORM_SYNC_FEATURE,
  QUESTION_COVERAGE,
  QUESTION_COVERAGE_FEATURE,
  STORE_INFO_FEATURE,
  STORE_INFO_FIELDS,
  TODO_TRIGGER_RULE,
  WORD_OF_MOUTH_FEATURE,
  computeGeoHealthScore,
  type GeoHealthInputs,
} from '../lib/geoModuleSpec'
import { readMerchantSession } from '../lib/merchantSession'
import {
  GeoOptimizationRoadmap,
  GeoScoreTrendCard,
  GeoStoreBreakdownTable,
} from '../components/geo/GeoOverviewEnhancements'
import { loadGeoScoreSnapshot, saveGeoScoreSnapshot } from '../lib/geoPersist'
import {
  buildGeoScoreContextPayload,
  computeDeterministicGeoFromStores,
  DEFAULT_GEO_QUERY_SAMPLES,
} from '../lib/geoScoresFromDouyinRows'
import { computePerStoreGeoDiagnostics } from '../lib/geoStoreDiagnostics'
import { listChainBrandOptions } from '../lib/storeBrandGroup'
import { applyStoreContactOverrides } from '../lib/storeContactOverride'
import {
  GEO_TEXT_AI_MODEL_OPTIONS,
  coerceGeoTextAiModel,
  postGeoAiConsult,
  postGeoAiConsultQuestion,
  postGeoAiScore,
} from '../services/douyinAiAssistApi'
import {
  fetchAllDouyinClaimedStoresPages,
  getDouyinMerchantBrands,
  getDouyinStoreDetail,
  getDouyinStores,
  type DouyinStoreRow,
} from '../services/douyinMerchantApi'
import { resolveTextAiModelForRequest } from '../services/merchantAiModelStorage'

const TABS = [
  { id: 'overview' as const, label: '概览' },
  { id: 'consult' as const, label: 'AI咨询测试' },
  { id: 'store' as const, label: '门店信息' },
  { id: 'content' as const, label: '内容库' },
  { id: 'query' as const, label: '问法覆盖' },
  { id: 'reputation' as const, label: '口碑证据' },
  { id: 'sync' as const, label: '平台同步' },
  { id: 'health' as const, label: '效果体检' },
]

type GeoTabId = (typeof TABS)[number]['id']

type TodoAction =
  | { kind: 'navigate'; to: string }
  | { kind: 'tab'; tab: GeoTabId; scrollId?: string }

type GeoTodoRow = {
  id: string
  title: string
  type: string
  priority: 'high' | 'medium'
  action: TodoAction
}

type GeoFilterScope = 'account' | 'brand' | 'single'

function mapAiTodoToAction(t: { title: string; type: string; priority: string }, idx: number): GeoTodoRow {
  const low = t.title.toLowerCase()
  let action: TodoAction = { kind: 'tab', tab: 'store' }
  if (/问法|覆盖|搜索|咨询/.test(low)) action = { kind: 'tab', tab: 'query' }
  else if (/内容|活动|faq|新鲜|更新/.test(low)) action = { kind: 'tab', tab: 'content' }
  else if (/停|车|位/.test(low)) action = { kind: 'tab', tab: 'store', scrollId: 'parking' }
  else if (/头图|门头|装修|照片|图片/.test(low)) action = { kind: 'navigate', to: '/store/decoration' }
  return {
    id: `ai-${idx}`,
    title: t.title,
    type: (t.type || '门店').slice(0, 8),
    priority: t.priority === 'high' ? 'high' : 'medium',
    action,
  }
}

/** 基于抖音来客门店行 + 当前评分结果生成咨询测试用的知识包 */
function buildGeoAiKnowledgePack(args: {
  scopeLabel: string
  accountName?: string
  stores: DouyinStoreRow[]
  infoCompletenessPercent: number
  questionCoveragePercent: number
  contentFreshnessPercent: number
  healthScore: number
  lastStructuredContentUpdateMs: number
  querySamples: readonly { q: string; covered: boolean }[]
}): string {
  const lastAt = new Date(args.lastStructuredContentUpdateMs).toLocaleString('zh-CN', { hour12: false })
  const blocks = args.stores.slice(0, 12).map((s, i) => {
    const lines = [
      `【门店${i + 1}】${s.name}（poi_id: ${s.id}）`,
      s.brandName ? `- 品牌：${s.brandName}` : null,
      s.address ? `- 地址：${s.address}` : `- 地址：（来客未返回或待补充）`,
      s.businessHours ? `- 营业：${s.businessHours}` : `- 营业：（待补充）`,
      s.phone ? `- 电话：${s.phone}` : `- 电话：（待补充）`,
      s.avatarUrl ? `- 门头/外显图：已维护` : `- 门头图：缺失或不可解析`,
      s.announcement ? `- 公告摘要：${s.announcement.slice(0, 200)}` : null,
      s.updatedAt ? `- 同步/更新时间：${s.updatedAt}` : null,
    ].filter(Boolean)
    return lines.join('\n')
  })
  return [
    `【评分范围】${args.scopeLabel}`,
    args.accountName ? `【来客账户】${args.accountName}` : null,
    `【GEO 指标】健康分 ${args.healthScore}/100；信息完整度 ${args.infoCompletenessPercent}%；问法覆盖率 ${args.questionCoveragePercent}%；内容新鲜度 ${args.contentFreshnessPercent}%`,
    `【内容时效参考】最近门店数据时间：${lastAt}`,
    `【门店事实（抖音来客）】`,
    ...blocks,
    `【问法覆盖样例】`,
    ...args.querySamples.map(
      (r) => `- 「${r.q}」：${r.covered ? '事实侧可支撑回答' : '事实侧待补齐'}`,
    ),
    `【说明】数据来自已绑定抖音来客门店接口，用于 GEO 咨询测试。`,
  ]
    .filter(Boolean)
    .join('\n')
}

function readDouyinToken(): string | null {
  return readMerchantSession('meoo_douyin_merchant_token')
}

function isValidTab(v: string | null): v is GeoTabId {
  return Boolean(v && TABS.some((t) => t.id === v))
}

export default function GeoPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const initialTab: GeoTabId = isValidTab(tabParam) ? tabParam : 'overview'
  const [tab, setTabState] = useState<GeoTabId>(initialTab)
  const pendingScrollRef = useRef<string | null>(null)
  const [healthBusy, setHealthBusy] = useState(false)
  const [healthReport, setHealthReport] = useState<string | null>(null)
  const [lastCheckAt, setLastCheckAt] = useState<string | null>(() =>
    new Date().toLocaleString('zh-CN', { hour12: false }),
  )
  const [savedSnapshot, setSavedSnapshot] = useState(() => loadGeoScoreSnapshot())
  const [apiBrandOptions, setApiBrandOptions] = useState<
    Array<{ brandId: string; brandName: string }>
  >([])

  const [aiModelUiTick, setAiModelUiTick] = useState(0)
  const [consultQuestion, setConsultQuestion] = useState(
    '这家店营业到几点？有停车位吗？',
  )
  const [consultBusy, setConsultBusy] = useState(false)
  const [genQuestionBusy, setGenQuestionBusy] = useState(false)
  const [consultErr, setConsultErr] = useState<string | null>(null)
  const [consultReply, setConsultReply] = useState<string | null>(null)
  const [showKnowledgePack, setShowKnowledgePack] = useState(false)

  const [geoScope, setGeoScope] = useState<GeoFilterScope>('account')
  const [brandKeyword, setBrandKeyword] = useState('')
  const [selectedPoiId, setSelectedPoiId] = useState('')
  const [pickerRows, setPickerRows] = useState<DouyinStoreRow[]>([])
  const [activeStores, setActiveStores] = useState<DouyinStoreRow[]>([])
  const [liveMetrics, setLiveMetrics] = useState<{
    inputs: GeoHealthInputs
    healthScore: number
    lastStructuredContentUpdateMs: number
  } | null>(null)
  const [querySamples, setQuerySamples] = useState<{ q: string; covered: boolean }[]>(() =>
    DEFAULT_GEO_QUERY_SAMPLES.map((x) => ({ ...x })),
  )
  const [aiTodosFromModel, setAiTodosFromModel] = useState<{ title: string; type: string; priority: string }[]>([])
  const [scoreSource, setScoreSource] = useState<'ai' | 'deterministic' | null>(null)
  const [scoreRationale, setScoreRationale] = useState('')
  const [scoreBusy, setScoreBusy] = useState(false)
  const [storesSyncErr, setStoresSyncErr] = useState<string | null>(null)
  const [accountNameFromApi, setAccountNameFromApi] = useState<string | undefined>(undefined)

  useEffect(() => {
    const tok = readDouyinToken()
    if (!tok) return
    let cancelled = false
    void (async () => {
      const r = await getDouyinStores({
        accessToken: tok,
        merchantId: readMerchantSession('meoo_douyin_merchant_id') ?? undefined,
        page: 1,
        pageSize: 80,
        claimScope: 'claimed',
        relationType: 'all',
      })
      if (cancelled || !r.ok) return
      setPickerRows(r.items)
      setAccountNameFromApi((prev) => r.accountName ?? prev)
      const chains = listChainBrandOptions(
        r.items.map((x) => ({
          id: x.id,
          name: x.name,
          address: x.address,
          brandName: x.brandName,
        })),
      )
      if (chains[0] && !brandKeyword.trim()) {
        setBrandKeyword(chains[0].brandName)
      }
    })()
    void (async () => {
      const br = await getDouyinMerchantBrands({
        accessToken: tok,
        merchantId: readMerchantSession('meoo_douyin_merchant_id') ?? undefined,
        pageSize: 50,
      })
      if (!cancelled && br.ok) setApiBrandOptions(br.items)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** 页顶选择「指定单店 / 品牌 / 全部门店」后拉取来客门店行，用于「门店信息」等分区展示（与「同步来客并 AI 综合评分」解耦） */
  useEffect(() => {
    const tok = readDouyinToken()
    if (!tok) return
    let cancelled = false
    const mid = readMerchantSession('meoo_douyin_merchant_id') ?? undefined

    const loadStores = async () => {
      if (geoScope === 'single') {
        const pid = selectedPoiId.trim()
        if (!pid) {
          if (!cancelled) setActiveStores([])
          return
        }
        const d = await getDouyinStoreDetail({ accessToken: tok, poiId: pid })
        if (cancelled || !d.ok) return
        setActiveStores(applyStoreContactOverrides('douyin', d.items.slice(0, 1)))
        if (d.accountName) setAccountNameFromApi((prev) => d.accountName ?? prev)
        return
      }
      if (geoScope === 'brand') {
        const kw = brandKeyword.trim()
        if (!kw) {
          if (!cancelled) setActiveStores([])
          return
        }
        const agg = await fetchAllDouyinClaimedStoresPages({
          accessToken: tok,
          merchantId: mid,
          storeBrand: kw,
        })
        if (cancelled || !agg.ok) return
        setActiveStores(applyStoreContactOverrides('douyin', agg.items))
        if (agg.accountName) setAccountNameFromApi((prev) => agg.accountName ?? prev)
        return
      }
      const agg = await fetchAllDouyinClaimedStoresPages({
        accessToken: tok,
        merchantId: mid,
        storeBrand: undefined,
      })
      if (cancelled || !agg.ok) return
      setActiveStores(applyStoreContactOverrides('douyin', agg.items))
      if (agg.accountName) setAccountNameFromApi((prev) => agg.accountName ?? prev)
    }

    if (geoScope === 'brand') {
      const timer = window.setTimeout(() => void loadStores(), 400)
      return () => {
        cancelled = true
        window.clearTimeout(timer)
      }
    }
    void loadStores()
    return () => {
      cancelled = true
    }
  }, [geoScope, selectedPoiId, brandKeyword])

  const setTab = useCallback(
    (id: GeoTabId, opts?: { scrollId?: string }) => {
      setTabState(id)
      setSearchParams(id === 'overview' ? {} : { tab: id }, { replace: true })
      if (opts?.scrollId) pendingScrollRef.current = opts.scrollId
    },
    [setSearchParams],
  )

  useEffect(() => {
    const t = searchParams.get('tab')
    const next: GeoTabId = isValidTab(t) ? t : 'overview'
    setTabState((prev) => (prev === next ? prev : next))
  }, [searchParams])

  useEffect(() => {
    if (tab !== 'store' || !pendingScrollRef.current) return
    const id = pendingScrollRef.current
    pendingScrollRef.current = null
    const el = document.getElementById(`geo-scroll-${id}`)
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [tab])

  const runTodo = useCallback(
    (action: TodoAction) => {
      if (action.kind === 'navigate') {
        navigate(action.to)
        return
      }
      setTab(action.tab, { scrollId: action.scrollId })
    },
    [navigate, setTab],
  )

  const scopeDisplayName = useMemo(() => {
    if (activeStores.length === 0) return '（尚未拉取门店）'
    if (geoScope === 'single') return activeStores[0]?.name ?? '单店'
    if (geoScope === 'brand' && brandKeyword.trim())
      return `品牌「${brandKeyword.trim()}」· ${activeStores.length} 店`
    return `抖音来客已认领 · ${activeStores.length} 店`
  }, [activeStores, geoScope, brandKeyword])

  const brandSelectOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: Array<{ value: string; label: string }> = []
    const add = (name: string, suffix: string) => {
      const v = name.trim()
      if (!v || seen.has(v.toLowerCase())) return
      seen.add(v.toLowerCase())
      out.push({ value: v, label: `${v}${suffix}` })
    }
    for (const b of apiBrandOptions) add(b.brandName, ' · 来客品牌')
    for (const g of listChainBrandOptions(
      pickerRows.map((x) => ({
        id: x.id,
        name: x.name,
        address: x.address,
        brandName: x.brandName,
      })),
    )) {
      add(g.brandName, ` · ${g.storeCount} 家门店`)
    }
    return out.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'))
  }, [apiBrandOptions, pickerRows])

  const storeDiagnostics = useMemo(
    () => computePerStoreGeoDiagnostics(activeStores),
    [activeStores],
  )

  const hasScore = Boolean(liveMetrics)
  const viewInputs = liveMetrics?.inputs ?? {
    infoCompletenessPercent: 0,
    questionCoveragePercent: 0,
    contentFreshnessPercent: 0,
  }
  const viewHealth = liveMetrics?.healthScore ?? 0
  const viewLastMs = liveMetrics?.lastStructuredContentUpdateMs ?? Date.now()

  const runHealthCheck = useCallback(() => {
    setHealthBusy(true)
    window.setTimeout(() => {
      if (!liveMetrics || activeStores.length === 0) {
        setHealthReport('请先在页顶完成「同步来客并 AI 综合评分」，再运行效果体检。')
      } else {
        const uncovered = querySamples.filter((q) => !q.covered).map((q) => q.q)
        const perStore = computePerStoreGeoDiagnostics(activeStores)
        const weak = perStore.filter((s) => s.completenessPercent < 85)
        const stale = CONTENT_FRESHNESS.triggerTodoRule(viewLastMs)
        const lines = [
          `综合健康分 ${viewHealth}/${GEO_HEALTH_SCORE.fullScore}（${scoreSource === 'ai' ? 'AI' : '规则'}）。`,
          `信息完整度 ${viewInputs.infoCompletenessPercent}%，问法覆盖 ${viewInputs.questionCoveragePercent}%，内容新鲜度 ${viewInputs.contentFreshnessPercent}%。`,
          stale
            ? `来客数据已超过 ${CONTENT_FRESHNESS.healthyDays} 天未更新，建议重新同步。`
            : '来客数据在健康周期内有更新。',
          weak.length
            ? `信息薄弱门店：${weak.map((s) => `${s.name}(${s.completenessPercent}%)`).join('、')}`
            : '各店基础字段完整度良好。',
          uncovered.length
            ? `待覆盖问法：${uncovered.slice(0, 5).join('；')}${uncovered.length > 5 ? '…' : ''}`
            : '高频问法在事实侧均已覆盖。',
          scoreRationale ? `评估摘要：${scoreRationale.slice(0, 280)}` : '',
        ]
        setHealthReport(lines.filter(Boolean).join('\n'))
      }
      setHealthBusy(false)
      setLastCheckAt(new Date().toLocaleString('zh-CN', { hour12: false }))
    }, 500)
  }, [
    liveMetrics,
    activeStores,
    querySamples,
    viewHealth,
    viewInputs,
    viewLastMs,
    scoreSource,
    scoreRationale,
  ])

  const syncAndScore = useCallback(async () => {
    const tok = readDouyinToken()
    if (!tok) {
      setStoresSyncErr('请先在「系统设置 → 平台连接」绑定抖音来客。')
      return
    }
    setScoreBusy(true)
    setStoresSyncErr(null)
    try {
      const mid = readMerchantSession('meoo_douyin_merchant_id') ?? undefined
      let rows: DouyinStoreRow[] = []
      let resolvedAccount = accountNameFromApi
      if (geoScope === 'single') {
        const pid = selectedPoiId.trim()
        if (!pid) {
          setStoresSyncErr('请在「指定单店」下选择一家门店。')
          return
        }
        const d = await getDouyinStoreDetail({ accessToken: tok, poiId: pid })
        if (!d.ok) {
          setStoresSyncErr(d.message)
          return
        }
        rows = applyStoreContactOverrides('douyin', d.items.slice(0, 1))
        if (d.accountName) resolvedAccount = d.accountName
      } else {
        const agg = await fetchAllDouyinClaimedStoresPages({
          accessToken: tok,
          merchantId: mid,
          storeBrand: geoScope === 'brand' ? brandKeyword.trim() || undefined : undefined,
        })
        if (!agg.ok) {
          setStoresSyncErr(agg.message)
          return
        }
        rows = applyStoreContactOverrides('douyin', agg.items)
        if (agg.accountName) resolvedAccount = agg.accountName
      }
      if (rows.length === 0) {
        setStoresSyncErr('当前筛选下没有门店：请调整品牌关键词或先在来客认领门店。')
        return
      }
      setActiveStores(rows)
      setAccountNameFromApi(resolvedAccount)

      const detRef = computeDeterministicGeoFromStores(rows)
      const ctx = buildGeoScoreContextPayload({
        scope: geoScope === 'single' ? 'single' : geoScope === 'brand' ? 'brand' : 'account',
        brandKeyword: geoScope === 'brand' ? brandKeyword : undefined,
        accountName: resolvedAccount,
        stores: rows,
      })
      const labelForAi =
        geoScope === 'single' && rows[0]
          ? rows[0].name
          : geoScope === 'brand' && brandKeyword.trim()
            ? `品牌:${brandKeyword.trim()}`
            : '账户聚合门店'
      const aiRes = await postGeoAiScore({
        model: coerceGeoTextAiModel(resolveTextAiModelForRequest()),
        geo_score_context: ctx,
        product_name: `GEO｜${labelForAi}`,
      })

      if (aiRes.ok) {
        const inputs: GeoHealthInputs = {
          infoCompletenessPercent: aiRes.payload.infoCompletenessPercent,
          questionCoveragePercent: aiRes.payload.questionCoveragePercent,
          contentFreshnessPercent: aiRes.payload.contentFreshnessPercent,
        }
        setLiveMetrics({
          inputs,
          healthScore: computeGeoHealthScore(inputs),
          lastStructuredContentUpdateMs: detRef.lastStructuredContentUpdateMs,
        })
        setScoreSource('ai')
        setScoreRationale(aiRes.payload.rationale_zh)
        setAiTodosFromModel(aiRes.payload.todos ?? [])
        setQuerySamples(
          aiRes.payload.covered_queries?.length ? aiRes.payload.covered_queries : detRef.querySamples,
        )
        persistGeoSnapshot(inputs, 'ai', aiRes.payload.rationale_zh)
      } else {
        setLiveMetrics({
          inputs: detRef.inputs,
          healthScore: computeGeoHealthScore(detRef.inputs),
          lastStructuredContentUpdateMs: detRef.lastStructuredContentUpdateMs,
        })
        setScoreSource('deterministic')
        const m = aiRes.message
        setScoreRationale(
          m.startsWith('上游模型调用失败：') ? `AI 未返回有效评分：${m}` : m,
        )
        setAiTodosFromModel([])
        setQuerySamples(detRef.querySamples)
        persistGeoSnapshot(detRef.inputs, 'deterministic', m.slice(0, 400))
      }

      function persistGeoSnapshot(
        snapInputs: GeoHealthInputs,
        source: 'ai' | 'deterministic',
        rationale?: string,
      ) {
        const scopeLabel =
          geoScope === 'single' && rows[0]
            ? rows[0].name
            : geoScope === 'brand' && brandKeyword.trim()
              ? `品牌「${brandKeyword.trim()}」· ${rows.length} 店`
              : `抖音来客已认领 · ${rows.length} 店`
        saveGeoScoreSnapshot({
          savedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
          scope: geoScope,
          brandKeyword: geoScope === 'brand' ? brandKeyword.trim() || undefined : undefined,
          scopeLabel,
          storeCount: rows.length,
          healthScore: computeGeoHealthScore(snapInputs),
          inputs: snapInputs,
          scoreSource: source,
          scoreRationale: rationale,
        })
        setSavedSnapshot(loadGeoScoreSnapshot())
      }
    } finally {
      setScoreBusy(false)
    }
  }, [accountNameFromApi, brandKeyword, geoScope, selectedPoiId, aiModelUiTick])

  const geoTodos = useMemo((): GeoTodoRow[] => {
    const seen = new Set<string>()
    const out: GeoTodoRow[] = []
    aiTodosFromModel.forEach((t, i) => {
      const row = mapAiTodoToAction(t, i)
      const k = row.title.trim().toLowerCase()
      if (seen.has(k)) return
      seen.add(k)
      out.push(row)
    })
    let n = out.length
    const pushRule = (row: GeoTodoRow) => {
      const k = row.title.trim().toLowerCase()
      if (seen.has(k)) return
      seen.add(k)
      out.push({ ...row, id: String(++n) })
    }
    if (!liveMetrics) return out
    const { infoCompletenessPercent, questionCoveragePercent } = liveMetrics.inputs
    const { lastStructuredContentUpdateMs } = liveMetrics
    if (INFO_COMPLETENESS.triggerTodoRule(infoCompletenessPercent)) {
      pushRule({
        id: '',
        title: OPTIMIZE_TODO.examples[0],
        type: '门店',
        priority: 'high',
        action: { kind: 'navigate', to: '/store/decoration' },
      })
      pushRule({
        id: '',
        title: OPTIMIZE_TODO.examples[1],
        type: '规则',
        priority: 'medium',
        action: { kind: 'tab', tab: 'store', scrollId: 'parking' },
      })
    }
    if (CONTENT_FRESHNESS.triggerTodoRule(lastStructuredContentUpdateMs)) {
      pushRule({
        id: '',
        title: OPTIMIZE_TODO.examples[2],
        type: '内容',
        priority: 'medium',
        action: { kind: 'tab', tab: 'content' },
      })
    }
    if (QUESTION_COVERAGE.triggerTodoRule(questionCoveragePercent)) {
      pushRule({
        id: '',
        title: `问法覆盖率低于 ${QUESTION_COVERAGE.warningThreshold}%，建议查漏补缺`,
        type: '问法',
        priority: 'medium',
        action: { kind: 'tab', tab: 'query' },
      })
    }
    return out
  }, [liveMetrics, aiTodosFromModel])

  const geoKnowledgePack = useMemo(() => {
    if (!liveMetrics || activeStores.length === 0) {
      return '（请先完成「同步来客并 AI 综合评分」，以生成可投喂模型的知识包）'
    }
    return buildGeoAiKnowledgePack({
      scopeLabel: scopeDisplayName,
      accountName: accountNameFromApi,
      stores: activeStores,
      infoCompletenessPercent: liveMetrics.inputs.infoCompletenessPercent,
      questionCoveragePercent: liveMetrics.inputs.questionCoveragePercent,
      contentFreshnessPercent: liveMetrics.inputs.contentFreshnessPercent,
      healthScore: liveMetrics.healthScore,
      lastStructuredContentUpdateMs: liveMetrics.lastStructuredContentUpdateMs,
      querySamples,
    })
  }, [liveMetrics, activeStores, scopeDisplayName, accountNameFromApi, querySamples])

  const runGeoGenerateConsultQuestion = useCallback(async () => {
    setConsultErr(null)
    if (!readDouyinToken()) {
      setConsultErr('请先在「系统设置 → 平台连接」完成抖音来客绑定后再生成咨询文案。')
      return
    }
    if (!liveMetrics || activeStores.length === 0) {
      setConsultErr('请先在概览上方完成「同步来客并 AI 综合评分」，再使用 AI 生成咨询文案。')
      return
    }
    if (geoKnowledgePack.length < 24 || geoKnowledgePack.startsWith('（请先完成')) {
      setConsultErr('知识包尚未就绪，请先同步来客门店并完成评分。')
      return
    }
    setGenQuestionBusy(true)
    try {
      const r = await postGeoAiConsultQuestion({
        model: coerceGeoTextAiModel(resolveTextAiModelForRequest()),
        store_display_name: scopeDisplayName.slice(0, 80),
        geo_knowledge_pack: geoKnowledgePack,
      })
      if (!r.ok) {
        setConsultErr(
          r.needVendorKey
            ? `${r.message} 请前往「系统设置 → 平台连接」页内的「AI 模型绑定」完成各模型 API Key。`
            : r.message,
        )
        return
      }
      const text = (r.description ?? '').trim()
      if (text.length < 8) {
        setConsultErr('生成结果过短，请重试或手动输入咨询内容。')
        return
      }
      setConsultQuestion(text)
      setConsultReply(null)
    } finally {
      setGenQuestionBusy(false)
    }
  }, [geoKnowledgePack, liveMetrics, activeStores.length, scopeDisplayName, aiModelUiTick])

  const runGeoConsult = useCallback(async () => {
    setConsultErr(null)
    setConsultReply(null)
    if (!readDouyinToken()) {
      setConsultErr('请先在「系统设置 → 平台连接」完成抖音来客绑定后再使用咨询模拟。')
      return
    }
    if (!liveMetrics || activeStores.length === 0) {
      setConsultErr('请先在概览上方完成「同步来客并 AI 综合评分」，再使用咨询测试。')
      return
    }
    const q = consultQuestion.trim()
    if (q.length < 4) {
      setConsultErr('请输入至少 4 个字的咨询内容。')
      return
    }
    setConsultBusy(true)
    try {
      const r = await postGeoAiConsult({
        model: coerceGeoTextAiModel(resolveTextAiModelForRequest()),
        store_display_name: scopeDisplayName.slice(0, 80),
        geo_knowledge_pack: geoKnowledgePack,
        user_question: q,
      })
      if (!r.ok) {
        setConsultErr(
          r.needVendorKey
            ? `${r.message} 请前往「系统设置 → 平台连接」页内的「AI 模型绑定」完成各模型 API Key。`
            : r.message,
        )
        return
      }
      setConsultReply((r.description ?? '').trim() || '（模型返回为空）')
    } finally {
      setConsultBusy(false)
    }
  }, [consultQuestion, geoKnowledgePack, liveMetrics, activeStores.length, scopeDisplayName, aiModelUiTick])

  const kpiCards = useMemo(
    () =>
      [
        {
          label: 'GEO健康分',
          value: hasScore ? String(viewHealth) : '—',
          suffix: hasScore ? `/${GEO_HEALTH_SCORE.fullScore}` : '',
          sub: hasScore
            ? `${scoreSource === 'ai' ? 'AI 综合' : '规则回退'} · 目标≥${GEO_HEALTH_SCORE.excellentThreshold}（信息×0.4+问法×0.35+新鲜×0.25）`
            : '同步来客并评分后展示',
          icon: Shield,
          accent: 'text-blue-600',
          subTone:
            hasScore && viewHealth >= GEO_HEALTH_SCORE.excellentThreshold
              ? ('text-green-600' as const)
              : ('text-amber-600' as const),
          onClick: () => setTab('health'),
        },
        {
          label: '信息完整度',
          value: hasScore ? `${viewInputs.infoCompletenessPercent}%` : '—',
          suffix: '',
          sub: `校验 ${INFO_COMPLETENESS.checkFields.length} 项口径 · 最优 ${INFO_COMPLETENESS.optimalValue}%`,
          icon: Store,
          accent: 'text-indigo-600',
          subTone: 'text-amber-600' as const,
          onClick: () => setTab('store'),
        },
        {
          label: '问法覆盖率',
          value: hasScore ? `${viewInputs.questionCoveragePercent}%` : '—',
          suffix: '',
          sub: `低于 ${QUESTION_COVERAGE.warningThreshold}% 将触发查漏补缺待办`,
          icon: Search,
          accent: 'text-purple-600',
          subTone: 'text-blue-600' as const,
          onClick: () => setTab('query'),
        },
        {
          label: '内容新鲜度',
          value: hasScore ? `${viewInputs.contentFreshnessPercent}%` : '—',
          suffix: '',
          sub: `${CONTENT_FRESHNESS.healthyDays} 天内来客数据更新为健康；得分结合 AI 与最近同步时间`,
          icon: Clock,
          accent: 'text-emerald-600',
          subTone: 'text-gray-500' as const,
          onClick: () => setTab('content'),
        },
      ] as const,
    [hasScore, viewHealth, viewInputs, scoreSource, setTab],
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="erp-page-title">GEO运营优化</h1>
        <p className="mt-1 text-sm text-gray-500">
          本地生活 AI 搜索优化：统一门店事实、结构化内容与问法覆盖，提升生成式搜索中的引用准确与到店转化。
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500">评分范围</label>
            <select
              value={geoScope}
              onChange={(e) => setGeoScope(e.target.value as GeoFilterScope)}
              className="mt-1 min-w-[10rem] rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900"
            >
              <option value="account">全部门店（账户聚合）</option>
              <option value="brand">按品牌名筛选</option>
              <option value="single">指定单店</option>
            </select>
          </div>
          {geoScope === 'brand' ? (
            <div className="min-w-[12rem] flex-1">
              <label className="block text-xs font-medium text-gray-500">选择品牌</label>
              {brandSelectOptions.length > 0 ? (
                <select
                  value={brandKeyword}
                  onChange={(e) => setBrandKeyword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900"
                >
                  <option value="">请选择连锁品牌…</option>
                  {brandSelectOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={brandKeyword}
                  onChange={(e) => setBrandKeyword(e.target.value)}
                  placeholder="输入品牌名，与来客「门店品牌」一致"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-900"
                />
              )}
              <p className="mt-1 text-xs text-gray-500">
                连锁门店将按品牌聚合评分与待办；单店仍可选「指定单店」。
              </p>
            </div>
          ) : null}
          {geoScope === 'single' ? (
            <div className="min-w-[14rem] flex-1">
              <label className="block text-xs font-medium text-gray-500">选择门店（来客已认领）</label>
              <select
                value={selectedPoiId}
                onChange={(e) => setSelectedPoiId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900"
              >
                <option value="">请选择…</option>
                {pickerRows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.brandName ? ` · ${r.brandName}` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button
            type="button"
            disabled={scoreBusy}
            onClick={() => void syncAndScore()}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {scoreBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            同步来客并 AI 综合评分
          </button>
        </div>
        {accountNameFromApi ? (
          <p className="mt-2 text-xs text-gray-500">当前来客账户：{accountNameFromApi}</p>
        ) : null}
        {scoreRationale ? (
          <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-700">
            <span className="font-medium text-gray-900">
              {scoreSource === 'ai' ? 'AI 评估摘要' : '评分说明'}
              ：
            </span>
            {scoreRationale}
          </p>
        ) : null}
        {storesSyncErr ? <p className="mt-2 text-sm text-red-600">{storesSyncErr}</p> : null}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <nav
          className="flex flex-wrap border-b border-gray-100 px-1 py-0.5 sm:px-2"
          aria-label="GEO 功能分区"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'relative whitespace-nowrap px-2.5 py-2 text-sm font-medium transition-colors sm:px-4 sm:py-3',
                tab === t.id
                  ? 'text-blue-600 after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-blue-600 sm:after:inset-x-4'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-white shadow-md">
            <h2 className="mb-4 text-xl font-bold md:text-2xl">
              GEO本地优化 - 让AI搜索更容易找到你
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
                <div className="mb-2 flex items-center">
                  <Sparkles className="mr-2 h-5 w-5 shrink-0" />
                  <span className="font-semibold">你能得到什么</span>
                </div>
                <ul className="space-y-1.5 text-sm text-white/90">
                  <li>• 提升在 AI 搜索、问答场景中的被引用概率</li>
                  <li>• 降低地址、营业、服务等事实性信息差错</li>
                  <li>• 缩短用户从「搜到」到「到店」的路径</li>
                </ul>
              </div>
              <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
                <div className="mb-2 flex items-center">
                  <Globe2 className="mr-2 h-5 w-5 shrink-0" />
                  <span className="font-semibold">我们怎么做</span>
                </div>
                <ul className="space-y-1.5 text-sm text-white/90">
                  <li>• 门店事实库标准化（地址、营业、设施等）</li>
                  <li>• 内容库结构化（FAQ、摘要卡、活动要点）</li>
                  <li>• 问法覆盖监测 + 定期效果体检形成闭环</li>
                </ul>
              </div>
              <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
                <div className="mb-2 flex items-center">
                  <Target className="mr-2 h-5 w-5 shrink-0" />
                  <span className="font-semibold">3步上手</span>
                </div>
                <ol className="list-inside list-decimal space-y-1.5 text-sm text-white/90">
                  <li>在「门店信息」中补全关键字段与图片</li>
                  <li>在「内容库」维护 FAQ / 摘要，供模型引用</li>
                  <li>在「问法覆盖」与「效果体检」中查漏补缺</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <GeoScoreTrendCard snapshot={savedSnapshot} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpiCards.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={c.onClick}
                className="rounded-xl border border-gray-200 bg-white p-6 text-left shadow-sm transition-shadow hover:border-blue-200 hover:shadow-md"
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="font-medium text-gray-600">{c.label}</span>
                  <c.icon className={cn('h-5 w-5', c.accent)} aria-hidden />
                </div>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold text-gray-900">{c.value}</span>
                  {c.suffix ? <span className="pb-1 text-sm text-gray-500">{c.suffix}</span> : null}
                </div>
                <div className={cn('mt-2 text-sm', c.subTone)}>{c.sub}</div>
                <span className="mt-3 inline-flex items-center text-xs font-medium text-blue-600">
                  查看详情 <ArrowRight className="ml-0.5 h-3 w-3" />
                </span>
              </button>
            ))}
          </div>

          <GeoOptimizationRoadmap healthScore={hasScore ? viewHealth : 0} />
          <GeoStoreBreakdownTable rows={storeDiagnostics} />

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-gray-900">优化待办</h3>
              <span className="text-sm text-gray-500">共 {geoTodos.length} 项</span>
            </div>
            <ul className="space-y-3">
              {geoTodos.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-3 sm:px-4"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {e.priority === 'high' ? (
                      <AlertCircle className="h-5 w-5 shrink-0 text-red-500" aria-hidden />
                    ) : (
                      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" aria-hidden />
                    )}
                    <span className="text-gray-800">{e.title}</span>
                    <span className="shrink-0 rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                      {e.type}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => runTodo(e.action)}
                    className="shrink-0 text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    去处理
                  </button>
                </li>
              ))}
            </ul>
            {geoTodos.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">当前无待办，请继续保持信息、问法与内容更新节奏。</p>
            ) : null}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2 text-sm text-blue-900">
                <MessageSquare className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
                <span>
                  将 GEO 知识包以「咨询」形式投喂已绑定的文本模型，可在「AI咨询测试」里一键实测回答效果。
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTab('consult')}
                className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                打开 AI 咨询测试
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'consult' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">AI 咨询测试</h2>
            <p className="mt-1 text-sm text-gray-500">
              知识包来自已同步的抖音来客门店事实与 GEO 评分结果。建议先用
              <strong className="font-medium text-gray-700">「AI 生成咨询文案」</strong>
              生成贴近真实场景的模拟问法（优先覆盖待补齐字段），再
              <strong className="font-medium text-gray-700">「发送至 AI 模型」</strong>
              查看回答是否准确、是否瞎编。
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-gray-900">文本模型</span>
                <AiModelAutoPicker
                  kind="text"
                  options={GEO_TEXT_AI_MODEL_OPTIONS}
                  onResolutionChange={() => setAiModelUiTick((n) => n + 1)}
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                自动模式按已配置 Key 与目录顺序选用模型；关闭后可指定通义或豆包。本页请求前会将模型规范为 GEO 支持的通义/豆包。
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowKnowledgePack((v) => !v)}
              className="mt-4 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              {showKnowledgePack ? '收起' : '查看'}将发送给模型的 GEO 知识包（{geoKnowledgePack.length} 字）
            </button>
            {showKnowledgePack ? (
              <textarea
                readOnly
                value={geoKnowledgePack}
                rows={14}
                className="mt-2 w-full resize-y rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-800"
              />
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium text-gray-900">模拟用户咨询</label>
              <button
                type="button"
                disabled={genQuestionBusy || consultBusy}
                onClick={() => void runGeoGenerateConsultQuestion()}
                className="inline-flex items-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-60"
              >
                {genQuestionBusy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
                )}
                AI 生成咨询文案
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              根据当前知识包与问法覆盖样例生成一条顾客口吻的测试问句，可编辑后再发送。
            </p>
            <textarea
              value={consultQuestion}
              onChange={(e) => setConsultQuestion(e.target.value)}
              rows={3}
              placeholder="例如：这家店几点关门？停车方便吗？也可点击上方一键生成"
              className="mt-2 w-full rounded-lg border border-gray-300 p-3 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={consultBusy || genQuestionBusy}
                onClick={() => void runGeoConsult()}
                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {consultBusy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="mr-2 h-4 w-4" aria-hidden />
                )}
                发送至 AI 模型
              </button>
              <span className="text-xs text-gray-500">需抖音来客登录态 + 已配置对应厂商 API Key</span>
            </div>

            {consultErr ? (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{consultErr}</p>
            ) : null}
            {consultReply ? (
              <div className="mt-6 rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
                <h3 className="text-sm font-semibold text-emerald-900">模型回复</h3>
                <pre className="ui-hint-block mt-2 whitespace-pre-wrap font-sans text-sm text-gray-800">
                  {consultReply}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {tab === 'store' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">门店信息标准化</h2>
              <p className="mt-1 text-sm text-gray-500">
                沉淀门店事实信息，形成可被 AI 检索与引用的结构化资产（与「店铺信息」数据同源，建议在店铺侧维护）。
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/store/info')}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <MapPin className="mr-2 h-4 w-4" />
              店铺信息（来客门店列表）
            </button>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            {(() => {
              const head = activeStores[0]
              const parkingOk = head
                ? /停|车位|车库/i.test(`${head.announcement ?? ''}${head.address ?? ''}`)
                : false
              return (
                <>
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-blue-100">
                  {head?.avatarUrl ? (
                    <img src={head.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Store className="h-8 w-8 text-blue-600" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{head?.name ?? '尚未同步门店'}</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {head
                      ? `POI ${head.id}${head.brandName ? ` · 品牌 ${head.brandName}` : ''}`
                      : geoScope === 'single' && !selectedPoiId.trim()
                        ? '请在页顶「指定单店」下选择一家门店'
                        : geoScope === 'brand' && !brandKeyword.trim()
                          ? '请在页顶输入品牌关键词以筛选门店'
                          : '正在拉取来客门店或暂无数据；评分与待办请再点击「同步来客并 AI 综合评分」'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {head?.businessStatus ? (
                      <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
                        {head.businessStatus}
                      </span>
                    ) : null}
                    {activeStores.length > 1 ? (
                      <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                        当前共 {activeStores.length} 店参与聚合评分
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">
                  {hasScore ? `${viewInputs.infoCompletenessPercent}%` : '—'}
                </div>
                <div className="text-sm text-gray-500">信息完整度（AI / 规则）</div>
                {head ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/store/detail/douyin/${encodeURIComponent(head.id)}`)}
                    className="mt-2 text-xs font-medium text-blue-600 hover:underline"
                  >
                    查看来客门店详情
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate('/store/info')}
                    className="mt-2 text-xs font-medium text-blue-600 hover:underline"
                  >
                    去店铺信息绑定门店
                  </button>
                )}
              </div>
                  </div>
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <h4 className="mb-3 flex items-center font-medium text-gray-900">
                  <MapPin className="mr-2 h-4 w-4 text-gray-500" />
                  地址与地理
                </h4>
                <div className="space-y-2 rounded-lg bg-gray-50 p-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">详细地址</span>
                    <span className="text-right text-gray-900">{head?.address ?? '—'}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">城市/区域</span>
                    <span className="text-right text-gray-900">{head?.city || head?.addressHierarchy || '—'}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">定位线索</span>
                    <span
                      className={cn(
                        'flex shrink-0 items-center',
                        head?.address && head.address.length > 6 ? 'text-emerald-600' : 'text-amber-600',
                      )}
                    >
                      {head?.address && head.address.length > 6 ? (
                        <>
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          有地址文本
                        </>
                      ) : (
                        '待补充'
                      )}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="mb-3 flex items-center font-medium text-gray-900">
                  <Clock className="mr-2 h-4 w-4 text-gray-500" />
                  营业与规则
                </h4>
                <div className="space-y-2 rounded-lg bg-gray-50 p-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">营业时间</span>
                    <span className="text-gray-900">{head?.businessHours ?? '—'}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">联系电话</span>
                    <span className="text-gray-900">{head?.phone ?? '—'}</span>
                  </div>
                  <div
                    id="geo-scroll-parking"
                    className={cn(
                      'flex justify-between gap-4 rounded-md px-2 py-2 ring-1',
                      parkingOk ? 'bg-emerald-50/80 ring-emerald-200/80' : 'bg-amber-50/80 ring-amber-200/80',
                    )}
                  >
                    <span className="text-gray-800">停车信息（公告/地址推断）</span>
                    <span className={cn('font-medium', parkingOk ? 'text-emerald-700' : 'text-amber-700')}>
                      {parkingOk ? '已提及' : '待完善'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/store/info')}
                    className="w-full rounded-lg border border-blue-200 bg-white py-2 text-xs font-medium text-blue-700 hover:bg-blue-50"
                  >
                    前往店铺信息编辑
                  </button>
                </div>
              </div>
                  </div>
                </>
              )
            })()}
            <div className="mt-6 rounded-lg border border-gray-100 bg-gray-50/80 p-4 text-sm text-gray-700">
              <p className="font-medium text-gray-900">模块能力（规范）</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-gray-600">
                <li>{STORE_INFO_FEATURE.fieldCheck}</li>
                <li>{STORE_INFO_FEATURE.statusMonitor}</li>
                <li>{STORE_INFO_FEATURE.multiPlatformSync}</li>
              </ul>
              <p className="mt-3 text-xs text-gray-500">
                字段分组：基础 {STORE_INFO_FIELDS.baseInfo.join('、')}；设施 {STORE_INFO_FIELDS.facility.join('、')}；素材{' '}
                {STORE_INFO_FIELDS.material.join('、')}；特殊规则 {STORE_INFO_FIELDS.specialRule.join('、')}
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === 'content' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">内容库</h2>
            <p className="mt-1 text-sm text-gray-500">
              FAQ、门店摘要、活动要点等结构化片段，便于大模型在回答用户时引用一致口径。
            </p>
            <p className="mt-2 text-xs text-gray-500">{AI_ADAPTATION_RULE}</p>
            {hasScore && CONTENT_FRESHNESS.triggerTodoRule(viewLastMs) ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                内容新鲜度预警：来客数据已超过 {CONTENT_FRESHNESS.healthyDays}{' '}
                天未更新，请同步门店并更新 FAQ / 活动要点。
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4 text-sm text-gray-800">
            <p className="font-medium text-indigo-900">内容库类型</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-700">
              <li>FAQ：{CONTENT_LIBRARY_TYPE.FAQ}</li>
              <li>门店摘要：{CONTENT_LIBRARY_TYPE.storeSummary}</li>
              <li>活动：{CONTENT_LIBRARY_TYPE.activity}</li>
            </ul>
            <p className="mt-3 font-medium text-indigo-900">关键特性</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-700">
              <li>{CONTENT_LIBRARY_FEATURE.structuredStorage}</li>
              <li>{CONTENT_LIBRARY_FEATURE.freshnessMonitor}</li>
              <li>{CONTENT_LIBRARY_FEATURE.aiAdaptation}</li>
            </ul>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 font-semibold text-gray-900">
                <BookOpen className="h-5 w-5 text-indigo-600" />
                文案与 FAQ
              </div>
              <p className="ui-hint-block mt-2 text-sm text-gray-600">
                使用运营侧 AI 工具生成或润色 FAQ、活动说明，再沉淀到内容库（后续可对接 CMS / 知识库）。
              </p>
              <button
                type="button"
                onClick={() => navigate('/ai-operation/content')}
                className="mt-4 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                去「AI 文章与话题」
                <ArrowRight className="ml-2 h-4 w-4" />
              </button>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 font-semibold text-gray-900">
                <Database className="h-5 w-5 text-gray-600" />
                摘要卡草稿
              </div>
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
                <li className="flex justify-between rounded bg-gray-50 px-3 py-2">
                  <span>门店一句话摘要</span>
                  <span className="text-emerald-600">已发布</span>
                </li>
                <li className="flex justify-between rounded bg-gray-50 px-3 py-2">
                  <span>主推套餐要点</span>
                  <span className="text-amber-600">草稿</span>
                </li>
              </ul>
              <button
                type="button"
                onClick={() => navigate('/products/list')}
                className="mt-4 text-sm font-medium text-blue-600 hover:underline"
              >
                关联商品卖点（打开商品列表）
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'query' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">问法覆盖</h2>
              <p className="mt-1 text-sm text-gray-500">
                梳理用户可能提问的方式，检查是否已在内容库或门店事实中有对应答案。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTab('content')}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
            >
              去维护内容库
            </button>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-4 text-sm text-gray-700">
            <p className="font-medium text-gray-900">问法覆盖能力</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-600">
              <li>{QUESTION_COVERAGE_FEATURE.questionLibrary}</li>
              <li>{QUESTION_COVERAGE_FEATURE.coverageAnalysis}</li>
              <li>{QUESTION_COVERAGE_FEATURE.optimizeGuide}</li>
            </ul>
            <p className="mt-3 text-xs text-gray-500">
              当前问法覆盖率 {hasScore ? `${viewInputs.questionCoveragePercent}%` : '—'}（警戒线{' '}
              {QUESTION_COVERAGE.warningThreshold}%）
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">典型问法</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">覆盖</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {querySamples.map((row) => (
                  <tr key={row.q}>
                    <td className="px-4 py-3 text-gray-900">{row.q}</td>
                    <td className="px-4 py-3">
                      {row.covered ? (
                        <span className="inline-flex items-center text-emerald-600">
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          已覆盖
                        </span>
                      ) : (
                        <span className="text-amber-600">待补充</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'reputation' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">口碑证据</h2>
            <p className="mt-1 text-sm text-gray-500">
              聚合可验证的评价与回复片段，作为 GEO 中的「信任信号」（与评论管理数据打通后自动同步）。
            </p>
            <ul className="mt-2 list-inside list-disc text-xs text-gray-500">
              <li>{WORD_OF_MOUTH_FEATURE.praiseKeyword}</li>
              <li>{WORD_OF_MOUTH_FEATURE.qualityCase}</li>
              <li>{WORD_OF_MOUTH_FEATURE.negativeMonitor}</li>
            </ul>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <ul className="space-y-3 text-sm text-gray-800">
              {hasScore && viewInputs.questionCoveragePercent >= 60 ? (
                <li className="flex gap-2 border-l-4 border-emerald-400 pl-3">
                  问法覆盖率达 {viewInputs.questionCoveragePercent}%：可将评论中的高频好评词（如服务、环境）沉淀为 GEO
                  口碑短语，写入门店公告或内容库。
                </li>
              ) : (
                <li className="flex gap-2 border-l-4 border-amber-400 pl-3">
                  问法覆盖偏低：先补全营业/停车等事实字段，再从评论管理提炼 3–5 条可引用好评摘要。
                </li>
              )}
              <li className="flex gap-2 border-l-4 border-blue-400 pl-3">
                在「评价管理」维护回复模板与精选评价，作为 AI 回答时的信任背书（与 GEO 问法覆盖联动）。
              </li>
            </ul>
            <button
              type="button"
              onClick={() => navigate('/reviews')}
              className="mt-6 inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              打开评论管理
              <ArrowRight className="ml-2 h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {tab === 'sync' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">平台同步</h2>
            <p className="mt-1 text-sm text-gray-500">
              将门店知识、商品与活动在对应平台侧保持更新，用户在 App 或小程序中看到的信息与 ERP 一致（按各平台上架规则执行）。
            </p>
            <p className="mt-2 text-xs text-gray-500">
              支持平台：{PLATFORM_SYNC_FEATURE.boundPlatform.join('、')}。{PLATFORM_SYNC_FEATURE.oneClickSync}；{PLATFORM_SYNC_FEATURE.syncStatus}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 font-semibold text-gray-900">
                <Store className="h-5 w-5 text-blue-600" />
                门店侧
              </div>
              <p className="mt-2 text-sm text-gray-600">核对抖音来客等平台的门店资料是否与事实库一致。</p>
              <button
                type="button"
                onClick={() => navigate('/store/info')}
                className="mt-4 text-sm font-medium text-blue-600 hover:underline"
              >
                前往店铺信息
              </button>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 font-semibold text-gray-900">
                <Link2 className="h-5 w-5 text-violet-600" />
                商品与活动
              </div>
              <p className="mt-2 text-sm text-gray-600">套餐、卖点与活动页需与内容库口径一致。</p>
              <button
                type="button"
                onClick={() => navigate('/products/list')}
                className="mt-4 text-sm font-medium text-blue-600 hover:underline"
              >
                前往商品列表
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'health' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">效果体检</h2>
              <p className="mt-1 text-sm text-gray-500">
                综合健康分、完整度、问法与内容维度给出体检结论；接入数据后可对接真实评测任务。
              </p>
            </div>
            <button
              type="button"
              disabled={healthBusy}
              onClick={() => void runHealthCheck()}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {healthBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Stethoscope className="mr-2 h-4 w-4" />}
              运行模拟体检
            </button>
          </div>
          {lastCheckAt && (
            <p className="text-xs text-gray-500">上次体检时间：{lastCheckAt}</p>
          )}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900">待办触发总规则</h3>
            <ul className="ui-hint-block mt-3 list-inside list-disc space-y-1 text-sm text-gray-700">
              {TODO_TRIGGER_RULE.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <h3 className="mt-6 font-semibold text-gray-900">效果体检能力</h3>
            <ul className="ui-hint-block mt-3 list-inside list-disc space-y-1 text-sm text-gray-700">
              <li>{EFFECT_CHECK_FEATURE.healthScoreTrend}</li>
              <li>{EFFECT_CHECK_FEATURE.exposureEffect}</li>
              <li>{EFFECT_CHECK_FEATURE.optimizeSuggestion}</li>
            </ul>
            <h3 className="mt-6 font-semibold text-gray-900">体检结论</h3>
            {healthReport ? (
              <pre className="ui-hint-block mt-3 whitespace-pre-wrap font-sans text-sm text-gray-800">
                {healthReport}
              </pre>
            ) : (
              <p className="mt-3 text-sm text-gray-500">
                点击「运行效果体检」将根据当前评分、各店完整度与问法覆盖生成结论（需先完成同步评分）。
              </p>
            )}
            <button
              type="button"
              onClick={() => setTab('overview')}
              className="mt-6 text-sm font-medium text-blue-600 hover:underline"
            >
              返回概览查看待办
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
