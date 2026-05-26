import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Mic,
  Package,
  Percent,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { pushLocalStoreIntelToCloud, upsertMarginConfigCloud } from '../lib/tenantStoreIntelCloud'
import { Link, useNavigate } from 'react-router-dom'
import {
  postDouyinProductQualityAnalysis,
  type ProductQualityItem,
  type ProductQualityPricingContext,
  type QualityProductPayload,
} from '../services/douyinAiAssistApi'
import {
  fetchStoreGrossMarginAdvisor,
  type GrossMarginAdvisorResult,
} from '../services/storeGrossMarginAdvisorApi'
import {
  type CreatePlatformId,
  PRODUCT_CREATE_PLATFORMS,
} from '../constants/productCreatePlatforms'
import { cn } from '../cn'
import {
  type PlatformConnectivityRow,
  type PlatformConnStatus,
  probeMerchantPlatforms,
} from '../services/platformConnectivityProbe'
import { MerchantPlatformIcon } from '../lib/platformBranding'
import StoreGrossMarginConfigCard from '../components/StoreGrossMarginConfigCard'
import { useAiAgent } from '../context/AiAgentContext'

type Conn = 'connected' | 'error' | 'pending' | 'opening'

function StatusIcon({ status }: { status: PlatformConnStatus }) {
  if (status === 'connected')
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
  if (status === 'error')
    return <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
  if (status === 'opening')
    return <Sparkles className="h-5 w-5 shrink-0 text-amber-500" />
  return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-gray-400" />
}

function CreateProductModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string[]>([])
  const [conn, setConn] = useState<Record<string, Conn>>(() =>
    Object.fromEntries(PRODUCT_CREATE_PLATFORMS.map((p) => [p.id, 'pending' as Conn])),
  )

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const rows = await probeMerchantPlatforms()
      if (cancelled) return
      const byId = Object.fromEntries(rows.map((r) => [r.id, r.status])) as Record<string, Conn>
      setConn(
        Object.fromEntries(
          PRODUCT_CREATE_PLATFORMS.map((p) => [p.id, byId[p.id] ?? 'error']),
        ) as Record<string, Conn>,
      )
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const canGoNext =
    selected.length > 0 && selected.every((id) => conn[id] === 'connected')

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="mx-4 max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
            <div className="flex items-center justify-between border-b bg-gray-50 p-5">
              <div className="flex items-center space-x-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="mr-2 rounded-lg p-2 hover:bg-gray-200"
                  aria-label="返回"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <h2 className="text-lg font-bold text-gray-900">创建商品</h2>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-gray-200">
                <X className="h-5 w-5 text-gray-600" />
              </button>
            </div>
            <div className="max-h-[calc(90vh-5rem)] overflow-y-auto p-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">创建商品</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    选择上线平台并检测连通性；下一步进入本系统内通过各平台创建商品 API 完成上品设置
                  </p>
                </div>
              </div>
              <div className="mb-6 space-y-4">
                <label className="block text-sm font-medium text-gray-700">
                  选择上线平台 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-4">
                  {PRODUCT_CREATE_PLATFORMS.map((p) => {
                    const on = selected.includes(p.id)
                    const st = conn[p.id]
                    const selectable = st === 'connected'
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (!selectable) return
                          toggle(p.id)
                        }}
                        className={cn(
                          'rounded-xl border-2 p-4 text-left transition-all',
                          selectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-75',
                          on
                            ? 'border-indigo-600 bg-indigo-50'
                            : cn(
                                'border-gray-200',
                                selectable && 'hover:border-gray-300',
                              ),
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <MerchantPlatformIcon
                              platformId={p.id}
                              name={p.name}
                              letter={p.letter}
                              color={p.color}
                              size="md"
                              className="rounded-lg"
                            />
                            <div>
                              <div className="font-medium text-gray-900">{p.name}</div>
                              {st === 'connected' && (
                                <div className="text-xs font-medium text-green-600">已接通</div>
                              )}
                              {st === 'pending' && (
                                <div className="text-xs text-gray-400">检测连通性…</div>
                              )}
                              {st === 'opening' && (
                                <div className="text-xs text-amber-700">功能开放中</div>
                              )}
                              {st === 'error' && (
                                <div className="text-xs text-red-500">
                                  未接通，请先在系统设置中完成绑定
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <StatusIcon status={st} />
                            <div
                              className={cn(
                                'flex h-5 w-5 items-center justify-center rounded border-2',
                                on ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300',
                              )}
                            >
                              {on && <Check className="h-3 w-3 text-white" />}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="flex justify-end space-x-3 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-gray-300 px-6 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!canGoNext) {
                      if (selected.length === 0) {
                        alert('请至少选择一个已接通的平台')
                      } else {
                        alert('所选平台须均为「已接通」状态，请先在系统设置完成绑定或等待检测结束')
                      }
                      return
                    }
                    navigate('/products/create', {
                      state: { platforms: selected as CreatePlatformId[] },
                    })
                    onClose()
                  }}
                  disabled={!canGoNext}
                  className="rounded-lg bg-indigo-600 px-6 py-2 text-sm text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  下一步
                </button>
              </div>
            </div>
      </motion.div>
    </motion.div>
  )
}

type SyncedProduct = {
  id: string
  name: string
  price: number
  /** 上架标题（若有则传给豆包质检） */
  titleHint?: string
  mainImageUrl?: string
  detailExcerpt?: string
}
type PickRow = SyncedProduct & { selected: boolean }

const DEFAULT_MARGINS = { douyin: 38, meituan: 35, xhs: 32 }
/** 新：毛利率 + 手动行业；旧：仅三平台数字 */
const MEOO_STORE_MARGIN_CONFIG_KEY = 'meoo_store_margin_config_v1'
const MEOO_STORE_GROSS_MARGINS_KEY = 'meoo_store_gross_margins_v1'

type StoreMargins = typeof DEFAULT_MARGINS

type MarginIndustry = {
  code: string
  leafCategoryId: string
  name: string
  path: string
}

type StoredMarginConfig = { margins: StoreMargins; industry: MarginIndustry }

function clampMarginPct(n: number): number {
  const x = Math.round(Number(n))
  if (!Number.isFinite(x)) return 0
  return Math.min(100, Math.max(0, x))
}

function parseMarginsFromUnknown(o: Record<string, unknown>): StoreMargins {
  const m = (o.margins && typeof o.margins === 'object' ? o.margins : o) as Record<string, unknown>
  return {
    douyin: clampMarginPct(Number(m.douyin ?? DEFAULT_MARGINS.douyin)),
    meituan: clampMarginPct(Number(m.meituan ?? DEFAULT_MARGINS.meituan)),
    xhs: clampMarginPct(Number(m.xhs ?? DEFAULT_MARGINS.xhs)),
  }
}

function loadStoredMarginConfig(): StoredMarginConfig {
  try {
    const raw = window.localStorage.getItem(MEOO_STORE_MARGIN_CONFIG_KEY)
    if (raw) {
      const o = JSON.parse(raw) as Record<string, unknown>
      const ind =
        o.industry && typeof o.industry === 'object' ? (o.industry as Record<string, unknown>) : {}
      return {
        margins: parseMarginsFromUnknown(o),
        industry: {
          code: typeof ind.code === 'string' ? ind.code : '',
          leafCategoryId: typeof ind.leafCategoryId === 'string' ? ind.leafCategoryId : '',
          name: typeof ind.name === 'string' ? ind.name : '',
          path: typeof ind.path === 'string' ? ind.path : '',
        },
      }
    }
    const legacy = window.localStorage.getItem(MEOO_STORE_GROSS_MARGINS_KEY)
    if (legacy) {
      const o = JSON.parse(legacy) as Record<string, unknown>
      return {
        margins: parseMarginsFromUnknown(o),
        industry: { code: '', leafCategoryId: '', name: '', path: '' },
      }
    }
  } catch {
    /* ignore */
  }
  return {
    margins: { ...DEFAULT_MARGINS },
    industry: { code: '', leafCategoryId: '', name: '', path: '' },
  }
}

function persistMarginConfig(cfg: StoredMarginConfig) {
  try {
    window.localStorage.setItem(MEOO_STORE_MARGIN_CONFIG_KEY, JSON.stringify(cfg))
    window.localStorage.setItem(MEOO_STORE_GROSS_MARGINS_KEY, JSON.stringify(cfg.margins))
  } catch {
    /* ignore */
  }
  if (supabaseConfigured && supabase) {
    void upsertMarginConfigCloud(supabase, {
      margins: cfg.margins,
      industry: cfg.industry,
    })
  }
}

type MarginAdvisorOk = Extract<GrossMarginAdvisorResult, { ok: true }>

function ScoreBar({ label, score, comment }: { label: string; score: number; comment: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-gray-100 bg-gray-50/80 p-3">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-gray-700">
        <span className="min-w-0 shrink leading-tight">{label}</span>
        <span className="shrink-0 tabular-nums text-indigo-600">{score} 分</span>
      </div>
      <div className="mb-2 h-2 shrink-0 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      <p className="min-h-[4.25rem] flex-1 text-xs leading-relaxed text-gray-600">{comment}</p>
    </div>
  )
}

export default function ProductsPage() {
  const analysisAbortRef = useRef<AbortController | null>(null)
  const [showApi, setShowApi] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [pickOpen, setPickOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [analysisQualityItems, setAnalysisQualityItems] = useState<ProductQualityItem[]>([])
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [displaySynced, setDisplaySynced] = useState<SyncedProduct[]>([])
  const [pickItems, setPickItems] = useState<PickRow[]>([])
  const initialMarginCfg = useMemo(() => loadStoredMarginConfig(), [])

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return
    void pushLocalStoreIntelToCloud(supabase)
  }, [])
  const [margins, setMargins] = useState<StoreMargins>(() => initialMarginCfg.margins)
  const [marginIndustry, setMarginIndustry] = useState<MarginIndustry>(
    () => initialMarginCfg.industry,
  )
  const [marginAdvisorData, setMarginAdvisorData] = useState<MarginAdvisorOk | null>(null)
  const [marginAdvisorLoading, setMarginAdvisorLoading] = useState(false)
  const [marginAdvisorError, setMarginAdvisorError] = useState<string | null>(null)
  const [apiRows, setApiRows] = useState<PlatformConnectivityRow[]>(() => [
    { id: 'douyin', name: '抖音来客', status: 'pending', lastChecked: '--' },
    { id: 'meituan', name: '美团点评', status: 'pending', lastChecked: '--' },
    { id: 'xiaohongshu', name: '小红书', status: 'pending', lastChecked: '--' },
    { id: 'jd', name: '京东本地生活', status: 'opening', lastChecked: '--' },
  ])
  const [apiProbing, setApiProbing] = useState(false)
  const [storeMarginOpen, setStoreMarginOpen] = useState(false)
  const platformProbeLockRef = useRef(false)
  const { openDrawer: openAiAgentDrawer } = useAiAgent()

  const runPlatformProbe = useCallback(async (opts?: { feedback?: boolean }) => {
    const feedback = opts?.feedback === true
    if (platformProbeLockRef.current) {
      if (feedback) setToast('正在检测中，请稍候')
      return
    }
    platformProbeLockRef.current = true
    setApiProbing(true)
    setApiRows((prev) =>
      prev.map((r) =>
        r.status === 'opening'
          ? r
          : { ...r, status: 'pending' as PlatformConnStatus, lastChecked: '检测中…' },
      ),
    )
    try {
      const rows = await probeMerchantPlatforms({ force: feedback })
      setApiRows(rows)
      if (feedback) setToast('已刷新平台连通状态')
    } catch {
      if (feedback) setToast('连通性检测失败，请稍后重试')
      const t = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      setApiRows((prev) =>
        prev.map((r) =>
          r.status === 'opening' ? r : { ...r, status: 'error' as PlatformConnStatus, lastChecked: t },
        ),
      )
    } finally {
      platformProbeLockRef.current = false
      setApiProbing(false)
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void runPlatformProbe()
    }, 0)
    return () => window.clearTimeout(id)
  }, [runPlatformProbe])

  const counts = useMemo(() => {
    const ok = apiRows.filter((p) => p.status === 'connected').length
    const bad = apiRows.filter((p) => p.status === 'error').length
    return { ok, bad }
  }, [apiRows])

  const selectedPick = pickItems.filter((x) => x.selected).length

  const openPickModal = useCallback(() => {
    setPickItems(displaySynced.map((p) => ({ ...p, selected: true })))
    setPickOpen(true)
  }, [displaySynced])

  const runAgentAnalysis = useCallback(async () => {
    if (displaySynced.length === 0) {
      setToast('请先同步或添加至少一个商品')
      return
    }
    if (analysisAbortRef.current) {
      setToast('分析进行中，请稍候或关闭弹窗以取消')
      return
    }
    const ac = new AbortController()
    analysisAbortRef.current = ac
    setAnalysisOpen(true)
    setAnalysisError(null)
    setAnalysisQualityItems([])
    setAnalyzing(true)
    const payload: QualityProductPayload[] = displaySynced.map((p) => {
      const id = String(p.id ?? '').trim() || `local-${Date.now()}`
      const name = String(p.name ?? '').trim() || `商品 ${id}`
      return {
        id,
        name,
        price_yuan: p.price,
        ...(p.titleHint?.trim() ? { title: p.titleHint.trim() } : {}),
        ...(p.mainImageUrl?.trim() ? { main_image_url: p.mainImageUrl.trim() } : {}),
        ...(p.detailExcerpt?.trim() ? { detail_excerpt: p.detailExcerpt.trim() } : {}),
      }
    })
    try {
      const ar = await fetchStoreGrossMarginAdvisor(
        marginIndustry.leafCategoryId
          ? { categoryId: marginIndustry.leafCategoryId, industryPath: marginIndustry.path }
          : marginIndustry.code
            ? { industryCode: marginIndustry.code }
            : undefined,
      )
      const advisor = ar.ok ? ar : null
      if (advisor) setMarginAdvisorData(advisor)
      const pricingContext: ProductQualityPricingContext = {
        industry_name: (advisor?.industryName ?? marginIndustry.name) || '未知',
        ...(advisor?.industryPath || marginIndustry.path
          ? { industry_path: advisor?.industryPath ?? marginIndustry.path }
          : {}),
        ...(advisor?.benchmarkNote ? { benchmark_note: advisor.benchmarkNote } : {}),
        merchant_gross_margin_percent: {
          douyin: margins.douyin,
          meituan: margins.meituan,
          xhs: margins.xhs,
        },
        ...(advisor
          ? {
              suggested_benchmark_percent: {
                douyin: advisor.suggestedPercent.douyin,
                meituan: advisor.suggestedPercent.meituan,
                xhs: advisor.suggestedPercent.xhs,
              },
            }
          : {}),
      }
      const r = await postDouyinProductQualityAnalysis(payload, {
        signal: ac.signal,
        timeoutMs: 130_000,
        pricingContext,
      })
      if (ac.signal.aborted) return
      if (!r.ok) {
        setAnalysisQualityItems([])
        setAnalysisError(
          r.needVendorKey
            ? `${r.message} 请前往「系统设置 → AI 模型绑定」中的「管理各模型 API Key」配置豆包 Key；或由运维在服务端环境变量配置 MERCHANT_AI_DOUBAO_KEY。`
            : r.message,
        )
        setToast('质检未完成')
        return
      }
      setAnalysisQualityItems(r.items)
      if (r.parseError) {
        setAnalysisError(
          r.items.length > 0
            ? `豆包已返回得分；附加说明：${r.parseError}`
            : `解析模型输出失败：${r.parseError}`,
        )
      } else {
        setAnalysisError(null)
      }
      setToast(
        r.items.length > 0
          ? '豆包已完成商品质量分析'
          : '豆包已响应，但未得到有效分项得分',
      )
    } catch (e) {
      if (ac.signal.aborted) return
      setAnalysisQualityItems([])
      setAnalysisError(e instanceof Error ? e.message : String(e))
      setToast('质检请求异常')
    } finally {
      if (analysisAbortRef.current === ac) analysisAbortRef.current = null
      setAnalyzing(false)
    }
  }, [displaySynced, margins, marginIndustry])

  const closeAnalysisModal = useCallback(() => {
    analysisAbortRef.current?.abort()
    setAnalysisOpen(false)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  useEffect(() => {
    let cancelled = false
    const q = marginIndustry.leafCategoryId
      ? { categoryId: marginIndustry.leafCategoryId, industryPath: marginIndustry.path }
      : marginIndustry.code
        ? { industryCode: marginIndustry.code }
        : undefined
    void fetchStoreGrossMarginAdvisor(q).then((r) => {
      if (cancelled) return
      if (r.ok) {
        setMarginAdvisorData(r)
        setMarginAdvisorError(null)
      } else {
        setMarginAdvisorData(null)
        setMarginAdvisorError(r.message)
      }
    })
    return () => {
      cancelled = true
    }
  }, [marginIndustry.leafCategoryId, marginIndustry.path, marginIndustry.code])

  const completePick = () => {
    const next = pickItems
      .filter((r) => r.selected)
      .map(({ id, name, price, titleHint, mainImageUrl, detailExcerpt }) => ({
        id,
        name,
        price,
        ...(titleHint ? { titleHint } : {}),
        ...(mainImageUrl ? { mainImageUrl } : {}),
        ...(detailExcerpt ? { detailExcerpt } : {}),
      }))
    if (next.length === 0) {
      setToast('请至少选择一个商品后再完成同步')
      return
    }
    setDisplaySynced(next)
    setPickOpen(false)
    setToast(`已更新「已同步商品」列表，共 ${next.length} 个`)
  }

  const startVoiceDemo = () => {
    setVoiceBusy(true)
    window.setTimeout(() => {
      setVoiceBusy(false)
      const draft: SyncedProduct = {
        id: `v-${Date.now()}`,
        name: `语音草稿-${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
        price: 0,
      }
      setDisplaySynced((prev) => [draft, ...prev])
      setVoiceOpen(false)
      setToast('已根据语音生成一条本地草稿，可在下方「已同步商品」中查看')
    }, 2200)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AnimatePresence>
        {createOpen && <CreateProductModal onClose={() => setCreateOpen(false)} />}
      </AnimatePresence>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] max-w-md -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2 text-center text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <AnimatePresence>
        {voiceOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => !voiceBusy && setVoiceOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">AI 语音录入</h3>
                <button
                  type="button"
                  disabled={voiceBusy}
                  onClick={() => setVoiceOpen(false)}
                  className="rounded-lg p-2 hover:bg-gray-100 disabled:opacity-50"
                  aria-label="关闭"
                >
                  <X className="h-5 w-5 text-gray-600" />
                </button>
              </div>
              <p className="text-sm text-gray-600">
                连接麦克风后口述商品名称、规格与价格，系统将生成草稿并加入商品列表。以下为体验流程，不向服务器上传真实音频。
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={voiceBusy}
                  onClick={() => setVoiceOpen(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  关闭
                </button>
                <button
                  type="button"
                  disabled={voiceBusy}
                  onClick={startVoiceDemo}
                  className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {voiceBusy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      识别中…
                    </>
                  ) : (
                    <>
                      <Mic className="mr-2 h-4 w-4" />
                      模拟语音录入
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {analysisOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={closeAnalysisModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">豆包 · 商品质量分析</h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    标题热度、主图质量、详情页质量、价格分析等维度得分（0–100），由火山方舟豆包模型生成；价格与毛利会结合「门店毛利配置」与行业建议毛利率做定性判断。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAnalysisModal}
                  className="rounded-lg p-2 hover:bg-gray-100"
                  aria-label="关闭"
                >
                  <X className="h-5 w-5 text-gray-600" />
                </button>
              </div>
              <div className="max-h-[calc(85vh-4rem)] overflow-y-auto px-6 py-4">
                {analysisError && (
                  <div
                    className={cn(
                      'mb-4 rounded-lg border px-3 py-2 text-sm',
                      analysisQualityItems.length > 0
                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                        : 'border-red-200 bg-red-50 text-red-800',
                    )}
                  >
                    {analysisError}
                    {!analysisQualityItems.length && (
                      <div className="mt-2">
                        <Link
                          to="/settings"
                          className="font-medium text-indigo-700 underline-offset-2 hover:underline"
                        >
                          打开系统设置
                        </Link>
                      </div>
                    )}
                  </div>
                )}
                {analyzing && analysisQualityItems.length === 0 && !analysisError && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="mb-4 w-full max-w-md rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-left text-xs text-gray-800">
                      <div className="mb-1 font-medium text-gray-700">
                        本次将分析已同步商品（{displaySynced.length} 个）：
                      </div>
                      <ul className="max-h-28 list-inside list-disc space-y-0.5 overflow-y-auto text-gray-700">
                        {displaySynced.map((p) => (
                          <li key={p.id}>
                            {p.name || `（未命名）`} · ¥{p.price}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Loader2 className="mb-4 h-12 w-12 animate-spin text-indigo-500" aria-hidden />
                    <p className="text-sm font-medium text-gray-800">正在请求豆包分析…</p>
                    <p className="mt-2 max-w-sm text-xs text-gray-500">
                      首次分析可能需要数十秒；请勿重复点击。关闭本窗口将取消请求。
                    </p>
                  </div>
                )}
                {!analyzing && analysisQualityItems.length === 0 && !analysisError && (
                  <p className="text-sm text-gray-500">暂无分析结果。</p>
                )}
                {analysisQualityItems.length > 0 ? (
                  <ul className="space-y-6">
                    {analysisQualityItems.map((it) => (
                      <li key={it.productId} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                          <div>
                            <div className="font-semibold text-gray-900">{it.productName}</div>
                            <div className="text-xs text-gray-500">商品 ID：{it.productId}</div>
                          </div>
                          <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5">
                            <span className="text-xs text-indigo-700">综合得分</span>
                            <span className="text-xl font-bold tabular-nums text-indigo-700">{it.overall}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-stretch">
                          <ScoreBar label="标题热度" score={it.titleHeat.score} comment={it.titleHeat.comment} />
                          <ScoreBar label="主图质量" score={it.mainImage.score} comment={it.mainImage.comment} />
                          <ScoreBar label="详情页质量" score={it.detailPage.score} comment={it.detailPage.comment} />
                          <ScoreBar
                            label="价格分析"
                            score={it.priceAnalysis.score}
                            comment={it.priceAnalysis.comment}
                          />
                        </div>
                        {it.suggestions.length > 0 && (
                          <div className="mt-3 border-t border-gray-100 pt-3">
                            <p className="mb-2 text-xs font-medium text-gray-600">优化建议</p>
                            <ul className="list-inside list-disc space-y-1 text-sm text-gray-700">
                              {it.suggestions.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="border-t border-gray-100 px-6 py-4 text-right">
                <button
                  type="button"
                  onClick={() => {
                    analysisAbortRef.current?.abort()
                    setAnalysisOpen(false)
                    setCreateOpen(true)
                  }}
                  className="mr-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  去创建商品
                </button>
                <button
                  type="button"
                  onClick={closeAnalysisModal}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
                >
                  知道了
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="erp-page-title">商品管理</h1>
          <p className="mt-1 text-sm text-gray-500">商品资料建档、平台同步与智能体检测</p>
        </div>
        <button
          type="button"
          onClick={() =>
            openAiAgentDrawer({
              pageLabel: '商品管理',
              pagePath: '/products',
              suggestedTasks: ['创建商品', '商品检测', '平台同步', '商品优化'],
            })
          }
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-2 text-sm font-medium text-indigo-800 shadow-sm transition-colors hover:border-indigo-300 hover:from-indigo-100/80 hover:to-violet-100/80"
        >
          <Sparkles className="h-4 w-4 text-indigo-600" aria-hidden />
          让 AI 处理商品
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <button
          type="button"
          onClick={() => setVoiceOpen(true)}
          className="flex w-full items-center space-x-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:bg-gray-50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
            <Mic className="h-5 w-5 text-gray-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">AI 语音录入</p>
            <p className="text-sm font-medium text-gray-900">已启用 · 点击录入</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => void runAgentAnalysis()}
          className="flex w-full items-center space-x-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:bg-gray-50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
            <Star className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">智能体检测</p>
            <p className="text-sm font-medium text-gray-900">
              {analyzing ? '分析中...' : '点击分析全部商品'}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            setShowApi((v) => {
              const next = !v
              if (next) void runPlatformProbe()
              return next
            })
          }}
          className="flex w-full items-center space-x-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:bg-gray-50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
            <RefreshCw className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">同步状态</p>
            <p className="text-sm font-medium text-gray-900">
              {counts.ok}正常 / {counts.bad}异常
            </p>
          </div>
        </button>
      </div>

      {showApi && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-gray-200 bg-white p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">平台API连通性</h3>
            <button
              type="button"
              onClick={() => void runPlatformProbe({ feedback: true })}
              aria-busy={apiProbing}
              className={cn(
                'flex items-center text-sm text-indigo-600 hover:text-indigo-700',
                apiProbing && 'opacity-80',
              )}
            >
              <RefreshCw className={cn('mr-1 h-4 w-4', apiProbing && 'animate-spin')} />
              刷新状态
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {apiRows.map((e) => (
              <div
                key={e.id}
                className={cn(
                  'rounded-lg border p-4',
                  e.status === 'connected'
                    ? 'border-green-200 bg-green-50'
                    : e.status === 'error'
                      ? 'border-red-200 bg-red-50'
                      : e.status === 'opening'
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-gray-200 bg-gray-50',
                )}
              >
                <div className="mb-2 flex items-center space-x-2">
                  <StatusIcon status={e.status} />
                  <span className="font-medium text-gray-900">{e.name}</span>
                </div>
                {e.status === 'opening' ? (
                  <p className="text-xs text-amber-800">功能开放中</p>
                ) : (
                  <p className="text-xs text-gray-500">最后检测: {e.lastChecked}</p>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <button
        type="button"
        onClick={() => setStoreMarginOpen(true)}
        title={`${marginIndustry.path || '类目未选'}\n抖音 ${margins.douyin}% · 美团 ${margins.meituan}% · 小红书 ${margins.xhs}%`}
        className="flex w-full flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:bg-gray-50 sm:flex-row sm:items-center sm:gap-4"
      >
        <div className="flex min-w-0 flex-1 items-start space-x-3 sm:items-center">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50">
            <Percent className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500">行业类目、建议毛利与质检上下文</p>
            <p className="text-sm font-medium text-gray-900">门店毛利配置</p>
            <p
              className="mt-0.5 truncate text-xs text-gray-500"
              title={marginIndustry.path || undefined}
            >
              {marginIndustry.path ? marginIndustry.path : '未选择经营类目 · 点击配置'}
            </p>
            <p className="mt-1 text-xs font-medium tabular-nums text-gray-700 sm:hidden">
              抖音 {margins.douyin}% · 美团 {margins.meituan}% · 小红书 {margins.xhs}%
            </p>
          </div>
        </div>
        <div className="hidden shrink-0 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 text-right sm:block">
          <p className="text-[11px] text-gray-500">抖音 / 美团 / 小红书</p>
          <p className="text-sm font-semibold tabular-nums text-gray-900">
            {margins.douyin}% · {margins.meituan}% · {margins.xhs}%
          </p>
        </div>
      </button>

      <AnimatePresence>
        {storeMarginOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
            onClick={() => setStoreMarginOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className="flex max-h-[min(88vh,640px)] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Percent className="h-4 w-4 shrink-0 text-amber-600" />
                  <span className="truncate text-sm font-semibold text-gray-900">门店毛利配置</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStoreMarginOpen(false)}
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                  aria-label="关闭"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <StoreGrossMarginConfigCard
                  compact
                  margins={margins}
                  marginIndustry={marginIndustry}
                  onSaved={({ margins: m, industry: ind }) => {
                    setMargins(m)
                    setMarginIndustry(ind)
                    persistMarginConfig({ margins: m, industry: ind })
                    setStoreMarginOpen(false)
                  }}
                  marginAdvisorData={marginAdvisorData}
                  setMarginAdvisorData={setMarginAdvisorData}
                  marginAdvisorLoading={marginAdvisorLoading}
                  setMarginAdvisorLoading={setMarginAdvisorLoading}
                  marginAdvisorError={marginAdvisorError}
                  setMarginAdvisorError={setMarginAdvisorError}
                  setToast={setToast}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="group rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-all duration-200 hover:border-transparent hover:bg-gradient-to-r hover:from-indigo-500 hover:to-indigo-600 hover:shadow-lg"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 transition-colors group-hover:bg-white/20">
            <Package className="h-5 w-5 text-indigo-600 transition-colors group-hover:text-white" />
          </div>
          <p className="font-semibold text-gray-900 transition-colors group-hover:text-white">创建商品</p>
          <p className="mt-1 text-xs text-gray-500 transition-colors group-hover:text-white/80">
            支持 AI 语音录入、商品资料建档与平台草稿生成
          </p>
        </button>
        <Link
          to="/products/list"
          className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-200 hover:border-transparent hover:bg-gradient-to-r hover:from-indigo-500 hover:to-indigo-600 hover:shadow-lg"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 transition-colors group-hover:bg-white/20">
            <Wand2 className="h-5 w-5 text-indigo-600 transition-colors group-hover:text-white" />
          </div>
          <p className="font-semibold text-gray-900 transition-colors group-hover:text-white">商品列表</p>
          <p className="mt-1 text-xs text-gray-500 transition-colors group-hover:text-white/80">
            按平台查看与编辑商品，对接各平台商品管理/查询 API，并支持同步至平台
          </p>
        </Link>
        <button
          type="button"
          onClick={() => void runAgentAnalysis()}
          className="group rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-all duration-200 hover:border-transparent hover:bg-gradient-to-r hover:from-indigo-500 hover:to-indigo-600 hover:shadow-lg"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 transition-colors group-hover:bg-white/20">
            <Sparkles className="h-5 w-5 text-indigo-600 transition-colors group-hover:text-white" />
          </div>
          <p className="font-semibold text-gray-900 transition-colors group-hover:text-white">AI 检测分析</p>
          <p className="mt-1 text-xs text-gray-500 transition-colors group-hover:text-white/80">
            {analyzing ? '分析中…' : '查看商品智能体检测结果，并进入修改与优化流程'}
          </p>
        </button>
        <button
          type="button"
          onClick={() => {
            setSyncing(true)
            window.setTimeout(() => {
              setSyncing(false)
              openPickModal()
            }, 900)
          }}
          className="group rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-all duration-200 hover:border-transparent hover:bg-gradient-to-r hover:from-indigo-500 hover:to-indigo-600 hover:shadow-lg"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 transition-colors group-hover:bg-white/20">
            {syncing ? (
              <RefreshCw className="h-5 w-5 animate-spin text-indigo-600 transition-colors group-hover:text-white" />
            ) : (
              <Package className="h-5 w-5 text-indigo-600 transition-colors group-hover:text-white" />
            )}
          </div>
          <p className="font-semibold text-gray-900 transition-colors group-hover:text-white">平台同步</p>
          <p className="mt-1 text-xs text-gray-500 transition-colors group-hover:text-white/80">
            {syncing ? '正在同步中...' : '抓取 API 已连通平台商品至商品列表'}
          </p>
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">商品同步</span>
          <button
            type="button"
            onClick={() => {
              if (syncing) return
              openPickModal()
            }}
            disabled={syncing}
            className="flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? '同步中...' : '同步商品'}
          </button>
        </div>
        <p className="mb-3 text-sm text-gray-500">
          点击同步按钮，从商品管理中获取已上传商品
        </p>
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">
            已同步商品 ({displaySynced.length}个)
          </div>
          <div className="grid grid-cols-2 gap-2">
            {displaySynced.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-2"
              >
                <span className="truncate text-sm text-gray-700">{p.name}</span>
                <span className="text-xs text-gray-500">¥{p.price}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {pickOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-blue-200 bg-white p-4 shadow-lg"
        >
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-medium text-gray-900">选择要同步的商品</h4>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() =>
                  setPickItems((rows) => rows.map((r) => ({ ...r, selected: true })))
                }
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                全选
              </button>
              <button
                type="button"
                onClick={() =>
                  setPickItems((rows) => rows.map((r) => ({ ...r, selected: false })))
                }
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                取消全选
              </button>
            </div>
          </div>
          <div className="mb-3 grid max-h-48 grid-cols-2 gap-2 overflow-y-auto">
            {pickItems.length === 0 ? (
              <p className="col-span-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 py-6 text-center text-sm text-gray-500">
                暂无可选商品。请返回商品管理补充资料，或使用「AI 语音录入」生成草稿。
              </p>
            ) : (
              pickItems.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() =>
                    setPickItems((rows) =>
                      rows.map((r) =>
                        r.id === e.id ? { ...r, selected: !r.selected } : r,
                      ),
                    )
                  }
                  className={cn(
                    'flex items-center rounded-lg border p-2 text-left transition-all',
                    e.selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300',
                  )}
                >
                  {e.selected ? (
                    <CheckCircle2 className="mr-2 h-4 w-4 shrink-0 text-blue-600" />
                  ) : (
                    <div className="mr-2 h-4 w-4 shrink-0 rounded border border-gray-300" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-gray-900">{e.name}</div>
                    <div className="text-xs text-gray-500">¥{e.price}</div>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">已选择 {selectedPick} 个商品</span>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() =>
                  setPickItems((rows) => rows.filter((r) => !r.selected))
                }
                disabled={selectedPick === 0}
                className="flex items-center rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                删除
              </button>
              <button
                type="button"
                onClick={completePick}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                完成
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
