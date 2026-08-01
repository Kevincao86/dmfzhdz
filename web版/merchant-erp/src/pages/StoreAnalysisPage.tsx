import {
  BarChart3,
  Loader2,
  RefreshCw,
  Sparkles,
  Store,
  TrendingUp,
  Users,
  AlertTriangle,
  Copy,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart as RechartsPie,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '../cn'
import { readMerchantSession } from '../lib/merchantSession'
import { getDouyinStores } from '../services/douyinMerchantApi'
import {
  fetchShopAnalysis,
  syncMerchantOrders,
  type ShopAnalysisSummary,
  type ShopStoreOption,
} from '../services/merchantOrdersApi'
import ModulePage from './ModulePage'

const CHART_COLORS = ['#4f46e5', '#0d9488', '#ea580c', '#db2777', '#2563eb', '#ca8a04', '#16a34a', '#9333ea']

const ADVICE_VISUALS: {
  match: RegExp
  icon: typeof Sparkles
  tone: string
  accent: string
}[] = [
  {
    match: /整体|概况|运营/,
    icon: BarChart3,
    tone: 'from-indigo-50 to-white border-indigo-100',
    accent: 'text-indigo-600 bg-indigo-100',
  },
  {
    match: /客群|复购|新客|老客/,
    icon: Users,
    tone: 'from-teal-50 to-white border-teal-100',
    accent: 'text-teal-700 bg-teal-100',
  },
  {
    match: /商品|表现|TOP/,
    icon: TrendingUp,
    tone: 'from-violet-50 to-white border-violet-100',
    accent: 'text-violet-700 bg-violet-100',
  },
  {
    match: /优化|建议/,
    icon: Sparkles,
    tone: 'from-amber-50 to-white border-amber-100',
    accent: 'text-amber-700 bg-amber-100',
  },
]

function shanghaiTodayYmd(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

function addDays(ymd: string, delta: number): string {
  const ms = new Date(`${ymd}T12:00:00+08:00`).getTime() + delta * 86_400_000
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

function yuan(n: number): string {
  return `¥${(Number(n) || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
}

function adviceSections(advice: string): { title: string; body: string; bullets: string[] }[] {
  const parts = advice.split(/\n(?=[一二三四]、)/)
  return parts
    .map((block) => {
      const lines = block.trim().split('\n')
      const title = lines[0] || ''
      const bodyLines = lines.slice(1).map((l) => l.replace(/^[·•\-]\s*/, '').trim()).filter(Boolean)
      return {
        title,
        body: bodyLines.join('\n'),
        bullets: bodyLines,
      }
    })
    .filter((x) => x.title)
}

function visualFor(title: string) {
  return (
    ADVICE_VISUALS.find((v) => v.match.test(title)) || {
      icon: Store,
      tone: 'from-slate-50 to-white border-slate-100',
      accent: 'text-slate-700 bg-slate-100',
    }
  )
}

export default function StoreAnalysisPage() {
  const today = shanghaiTodayYmd()
  const [startDate, setStartDate] = useState(() => addDays(today, -29))
  const [endDate, setEndDate] = useState(today)
  const [platform, setPlatform] = useState('douyin')
  const [poiId, setPoiId] = useState('')
  const [storeOptions, setStoreOptions] = useState<ShopStoreOption[]>([])

  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [err, setErr] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [summary, setSummary] = useState<ShopAnalysisSummary | null>(null)
  const [advice, setAdvice] = useState('')
  const [showAdvice, setShowAdvice] = useState(false)

  const mergeStoreNames = useCallback(async (stores: ShopStoreOption[]): Promise<ShopStoreOption[]> => {
    if (!stores.length || platform !== 'douyin') return stores
    const accessToken = readMerchantSession('meoo_douyin_merchant_token')
    if (!accessToken) return stores
    try {
      const res = await getDouyinStores({ accessToken, page: 1, pageSize: 100 })
      if (!res.ok || !res.items?.length) return stores
      const nameById = new Map(
        res.items.map((row) => [String(row.id || '').trim(), String(row.name || '').trim()]),
      )
      return stores.map((s) => {
        const nm = nameById.get(s.poiId)
        return nm ? { ...s, poiName: nm } : s
      })
    } catch {
      return stores
    }
  }, [platform])

  const loadCharts = useCallback(async () => {
    setLoading(true)
    setErr('')
    setShowAdvice(false)
    try {
      const r = await fetchShopAnalysis({
        startDate,
        endDate,
        platform,
        poiId: poiId || undefined,
      })
      setSummary(r.summary)
      setAdvice(r.adviceFacts)
      if (r.summary.stores?.length) {
        const named = await mergeStoreNames(r.summary.stores)
        setStoreOptions(named)
        setSummary({ ...r.summary, stores: named })
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败')
      setSummary(null)
      setAdvice('')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, platform, poiId, mergeStoreNames])

  /** 首屏只拉已落库数据出图，不阻塞同步 */
  useEffect(() => {
    void loadCharts()
  }, [loadCharts])

  const onSync = async () => {
    setSyncing(true)
    setErr('')
    try {
      const s = await syncMerchantOrders({ startDate, endDate })
      setWarnings(s.warnings || [])
      await loadCharts()
    } catch (e) {
      setWarnings([e instanceof Error ? e.message : '同步失败（仍展示已落库数据）'])
      await loadCharts()
    } finally {
      setSyncing(false)
    }
  }

  const onAnalyze = async () => {
    setAnalyzing(true)
    setErr('')
    try {
      const r = await fetchShopAnalysis({
        startDate,
        endDate,
        platform,
        poiId: poiId || undefined,
      })
      setSummary(r.summary)
      setAdvice(r.adviceFacts)
      if (r.summary.stores?.length) setStoreOptions(r.summary.stores)
      setShowAdvice(true)
      requestAnimationFrame(() => {
        document.getElementById('shop-advice-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '分析失败')
    } finally {
      setAnalyzing(false)
    }
  }

  const guestPie = useMemo(() => {
    if (!summary || summary.buyerCount <= 0) return []
    const newN = summary.newBuyerCount
    const oldN = summary.oldBuyerCount > 0 ? summary.oldBuyerCount : Math.max(0, summary.buyerCount - newN)
    return [
      { name: '新客', value: newN },
      { name: '老客', value: oldN },
    ].filter((x) => x.value > 0)
  }, [summary])

  const repurchasePie = useMemo(() => {
    if (!summary || summary.buyerCount <= 0) return []
    return [
      { name: '仅买 1 次', value: summary.oneTimeBuyerCount },
      { name: '买 ≥2 次', value: summary.repeatBuyerCount },
    ].filter((x) => x.value > 0)
  }, [summary])

  const salesBar = useMemo(() => {
    if (!summary) return []
    return summary.topBySales.slice(0, 8).map((p, i) => ({
      name: `#${i + 1}`,
      fullName: p.name,
      成交额: Math.round(p.salesYuan),
      rank: i + 1,
    }))
  }, [summary])

  const refundBar = useMemo(() => {
    if (!summary) return []
    return summary.topByRefund.slice(0, 6).map((p, i) => ({
      name: `#${i + 1}`,
      fullName: p.name,
      退款额: Math.round(p.refundYuan),
      退款率: p.refundRate,
    }))
  }, [summary])

  const sections = useMemo(() => adviceSections(advice), [advice])

  return (
    <ModulePage
      title="店铺分析"
      subtitle="先看成交与客群图表；点击「店铺分析」生成图文经营建议"
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">
          开始
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-slate-600">
          结束
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-slate-600">
          平台
          <select
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value)
              setPoiId('')
            }}
            className="mt-1 block min-w-[8rem] rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="douyin">抖音来客</option>
            <option value="all">全部平台</option>
          </select>
        </label>
        <label className="text-sm text-slate-600">
          门店
          <select
            value={poiId}
            onChange={(e) => setPoiId(e.target.value)}
            className="mt-1 block min-w-[12rem] max-w-[16rem] rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">全部门店</option>
            {storeOptions.map((s) => (
              <option key={s.poiId || s.poiName} value={s.poiId}>
                {s.poiName}
                {s.orderCount ? `（${s.orderCount}）` : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={loading || syncing || analyzing}
          onClick={() => void onSync()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          同步数据
        </button>
        <button
          type="button"
          disabled={loading || syncing || analyzing || !summary}
          onClick={() => void onAnalyze()}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          店铺分析
        </button>
        <Link to="/finance" className="text-sm text-indigo-600 hover:underline">
          财务订单明细 →
        </Link>
      </div>

      {err ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>
      ) : null}
      {warnings.length ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {warnings.slice(0, 4).map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      ) : null}

      {!summary && loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载图表…
        </div>
      ) : null}

      {summary ? (
        <div className="space-y-6">
          {summary.guestBasis === 'repurchase' ? (
            <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                库内暂无更早订单对照，新老客按「区间内是否复购」识别：仅买 1 次为新客，买 ≥2 次为老客（与复购率一致）。向前多同步
                30～60 天后可改为按历史首购判断。
              </p>
            </div>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { k: '成交额', v: yuan(summary.salesAmountYuan), hint: `${summary.orderCount} 笔订单` },
              {
                k: '退款率',
                v: `${summary.refundRate}%`,
                hint: yuan(summary.refundAmountYuan),
                danger: summary.refundRate >= 20,
              },
              {
                k: '复购率',
                v: `${summary.repurchaseRate}%`,
                hint: `${summary.buyerCount} 位可识别买家`,
              },
              {
                k: '新客占比',
                v: `${summary.newBuyerShare}%`,
                hint: `新客 ${summary.newBuyerCount} / 老客 ${summary.oldBuyerCount}`,
              },
            ].map((x) => (
              <div key={x.k} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">{x.k}</p>
                <p className={cn('mt-1 text-2xl font-semibold', x.danger ? 'text-rose-600' : 'text-slate-900')}>
                  {x.v}
                </p>
                <p className="mt-1 text-xs text-slate-400">{x.hint}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-1 text-sm font-semibold text-slate-900">成交 TOP</h3>
              <p className="mb-2 text-xs text-slate-400">柱上为排名，完整品名见下方列表 / 悬停提示</p>
              {salesBar.length ? (
                <>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={salesBar} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(v) => yuan(Number(v))}
                          labelFormatter={(_, payload) => {
                            const p = payload?.[0]?.payload as { fullName?: string } | undefined
                            return p?.fullName || ''
                          }}
                        />
                        <Bar dataKey="成交额" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <ol className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs text-slate-600">
                    {summary.topBySales.slice(0, 8).map((p, i) => (
                      <li key={p.productId || p.name} className="flex gap-2">
                        <span className="shrink-0 font-medium text-indigo-600">#{i + 1}</span>
                        <span className="truncate" title={p.name}>
                          {p.name}
                        </span>
                        <span className="ml-auto shrink-0 text-slate-400">{yuan(p.salesYuan)}</span>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p className="py-10 text-center text-sm text-slate-400">暂无成交数据</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-1 text-sm font-semibold text-slate-900">新客 / 老客结构</h3>
              <p className="mb-3 text-xs text-slate-400">
                {summary.guestBasis === 'history'
                  ? '新客 = 开始日前无成交；老客 = 开始日前已有成交'
                  : '新客 = 区间内仅买 1 次；老客 = 区间内买 ≥2 次'}
              </p>
              {guestPie.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie data={guestPie} dataKey="value" nameKey="name" innerRadius={52} outerRadius={86} paddingAngle={3}>
                        {guestPie.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-slate-400">买家识别不足，暂无饼图</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-1 text-sm font-semibold text-slate-900">复购结构</h3>
              <p className="mb-3 text-xs text-slate-400">区间内可识别买家：仅买 1 次 vs 买 ≥2 次</p>
              {repurchasePie.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie data={repurchasePie} dataKey="value" nameKey="name" outerRadius={90} paddingAngle={2}>
                        {repurchasePie.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[(i + 1) % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-slate-400">暂无复购结构</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-1 text-sm font-semibold text-slate-900">退款压力（TOP）</h3>
              <p className="mb-2 text-xs text-slate-400">退款额越高越需要优先处理；完整品名见下方</p>
              {refundBar.length ? (
                <>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={refundBar} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={36} tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(v, key) => (key === '退款率' ? `${v}%` : yuan(Number(v)))}
                          labelFormatter={(_, payload) => {
                            const p = payload?.[0]?.payload as { fullName?: string } | undefined
                            return p?.fullName || ''
                          }}
                        />
                        <Bar dataKey="退款额" fill="#e11d48" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <ol className="mt-2 max-h-24 space-y-1 overflow-y-auto text-xs text-slate-600">
                    {summary.topByRefund.slice(0, 6).map((p, i) => (
                      <li key={p.productId || p.name} className="flex gap-2">
                        <span className="shrink-0 font-medium text-rose-600">#{i + 1}</span>
                        <span className="truncate" title={p.name}>
                          {p.name}
                        </span>
                        <span className="ml-auto shrink-0 text-slate-400">
                          {yuan(p.refundYuan)} · {p.refundRate}%
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p className="py-10 text-center text-sm text-slate-400">区间内无明显退款</p>
              )}
            </div>
          </section>

          {!showAdvice ? (
            <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 px-5 py-8 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-indigo-500" />
              <p className="mt-3 text-sm font-medium text-slate-800">图表已就绪</p>
              <p className="mt-1 text-xs text-slate-500">点击上方「店铺分析」，生成图文经营建议</p>
              <button
                type="button"
                disabled={analyzing}
                onClick={() => void onAnalyze()}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                店铺分析
              </button>
            </div>
          ) : (
            <section id="shop-advice-panel" className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">经营建议</h3>
                  <p className="text-xs text-slate-400">按成交、退款与客群自动生成 · 图文卡片</p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                  onClick={() => {
                    void navigator.clipboard.writeText(advice)
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  复制报告
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {sections.length ? (
                  sections.map((sec) => {
                    const vis = visualFor(sec.title)
                    const Icon = vis.icon
                    return (
                      <article
                        key={sec.title}
                        className={cn(
                          'relative overflow-hidden rounded-xl border bg-gradient-to-br p-4 shadow-sm',
                          vis.tone,
                        )}
                      >
                        <div
                          className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-30"
                          style={{
                            background:
                              'radial-gradient(circle, rgba(79,70,229,0.35) 0%, transparent 70%)',
                          }}
                        />
                        <div className="relative flex items-start gap-3">
                          <span
                            className={cn(
                              'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                              vis.accent,
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-semibold text-slate-900">{sec.title}</h4>
                            <ul className="mt-2 space-y-2">
                              {(sec.bullets.length ? sec.bullets : [sec.body || '（本节暂无要点）']).map(
                                (line, idx) => (
                                  <li
                                    key={`${sec.title}-${idx}`}
                                    className="flex gap-2 text-sm leading-relaxed text-slate-700"
                                  >
                                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                                    <span>{line}</span>
                                  </li>
                                ),
                              )}
                            </ul>
                          </div>
                        </div>
                      </article>
                    )
                  })
                ) : (
                  <pre className="col-span-full whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
                    {advice}
                  </pre>
                )}
              </div>
              <p className="mt-4 text-xs text-slate-400">
                说明：新客/老客按「区间开始前是否有成交」判定；毛利为商家自填比例估算；竞对成交无法从平台 API
                获取。
              </p>
            </section>
          )}
        </div>
      ) : null}
    </ModulePage>
  )
}
