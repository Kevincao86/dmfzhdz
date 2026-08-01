import { Loader2, RefreshCw } from 'lucide-react'
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
import {
  fetchShopAnalysis,
  syncMerchantOrders,
  type ShopAnalysisSummary,
} from '../services/merchantOrdersApi'
import ModulePage from './ModulePage'

const CHART_COLORS = ['#4f46e5', '#0d9488', '#ea580c', '#db2777', '#2563eb', '#ca8a04', '#16a34a', '#9333ea']

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

function shortName(name: string, max = 14): string {
  const s = (name || '').trim()
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function adviceSections(advice: string): { title: string; body: string }[] {
  const parts = advice.split(/\n(?=[一二三四]、)/)
  return parts
    .map((block) => {
      const lines = block.trim().split('\n')
      const title = lines[0] || ''
      const body = lines.slice(1).join('\n').trim()
      return { title, body }
    })
    .filter((x) => x.title)
}

export default function StoreAnalysisPage() {
  const today = shanghaiTodayYmd()
  const [startDate, setStartDate] = useState(() => addDays(today, -29))
  const [endDate, setEndDate] = useState(today)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [err, setErr] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [summary, setSummary] = useState<ShopAnalysisSummary | null>(null)
  const [advice, setAdvice] = useState('')

  const load = useCallback(
    async (withSync: boolean) => {
      setLoading(true)
      setErr('')
      try {
        if (withSync) {
          setSyncing(true)
          try {
            const s = await syncMerchantOrders({ startDate, endDate })
            setWarnings(s.warnings || [])
          } catch (e) {
            setWarnings([e instanceof Error ? e.message : '同步失败（仍展示已落库数据）'])
          } finally {
            setSyncing(false)
          }
        }
        const r = await fetchShopAnalysis({ startDate, endDate, platform: 'douyin' })
        setSummary(r.summary)
        setAdvice(r.adviceFacts)
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败')
        setSummary(null)
      } finally {
        setLoading(false)
      }
    },
    [startDate, endDate],
  )

  useEffect(() => {
    void load(true)
  }, [load])

  const guestPie = useMemo(() => {
    if (!summary || summary.buyerCount <= 0) return []
    const newN = summary.newBuyerCount
    const oldN = Math.max(0, summary.buyerCount - newN)
    return [
      { name: '新客', value: newN },
      { name: '老客', value: oldN },
    ].filter((x) => x.value > 0)
  }, [summary])

  const salesBar = useMemo(() => {
    if (!summary) return []
    return summary.topBySales.slice(0, 8).map((p) => ({
      name: shortName(p.name, 10),
      fullName: p.name,
      成交额: Math.round(p.salesYuan),
    }))
  }, [summary])

  const refundBar = useMemo(() => {
    if (!summary) return []
    return summary.topByRefund.slice(0, 6).map((p) => ({
      name: shortName(p.name, 10),
      fullName: p.name,
      退款额: Math.round(p.refundYuan),
      退款率: p.refundRate,
    }))
  }, [summary])

  const catPie = useMemo(() => {
    if (!summary) return []
    return summary.categories.slice(0, 6).map((c) => ({
      name: c.name === '未分类' ? '未分类（待补类目）' : shortName(c.name, 12),
      value: Math.round(c.salesYuan),
    }))
  }, [summary])

  const sections = useMemo(() => adviceSections(advice), [advice])

  return (
    <ModulePage
      title="店铺分析"
      subtitle="看懂成交、退款与客群；同步抖音订单后自动生成建议"
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
        <button
          type="button"
          disabled={loading || syncing}
          onClick={() => void load(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {syncing || loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          同步并刷新
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
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
        </div>
      ) : null}

      {summary ? (
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { k: '成交额', v: yuan(summary.salesAmountYuan), hint: `${summary.orderCount} 笔订单` },
              { k: '退款率', v: `${summary.refundRate}%`, hint: yuan(summary.refundAmountYuan), danger: summary.refundRate >= 20 },
              { k: '复购率', v: `${summary.repurchaseRate}%`, hint: `${summary.buyerCount} 位可识别买家` },
              { k: '新客占比', v: `${summary.newBuyerShare}%`, hint: `${summary.newBuyerCount} 位新客` },
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
              <h3 className="mb-1 text-sm font-semibold text-slate-900">成交 TOP（更好对比谁在卖）</h3>
              <p className="mb-3 text-xs text-slate-400">横轴为商品简称，纵轴为成交额（元）</p>
              {salesBar.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={salesBar} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
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
              ) : (
                <p className="py-10 text-center text-sm text-slate-400">暂无成交数据</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-1 text-sm font-semibold text-slate-900">新客 / 老客结构</h3>
              <p className="mb-3 text-xs text-slate-400">按区间内可识别买家人数（依赖 open_id）</p>
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
              <h3 className="mb-1 text-sm font-semibold text-slate-900">品类成交占比</h3>
              <p className="mb-3 text-xs text-slate-400">类目未回传时会显示「未分类」</p>
              {catPie.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie data={catPie} dataKey="value" nameKey="name" outerRadius={90}>
                        {catPie.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => yuan(Number(v))} />
                      <Legend />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-slate-400">暂无品类</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-1 text-sm font-semibold text-slate-900">退款压力（TOP）</h3>
              <p className="mb-3 text-xs text-slate-400">退款额越高越需要优先处理</p>
              {refundBar.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={refundBar} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(v, key) =>
                          key === '退款率' ? `${v}%` : yuan(Number(v))
                        }
                        labelFormatter={(_, payload) => {
                          const p = payload?.[0]?.payload as { fullName?: string } | undefined
                          return p?.fullName || ''
                        }}
                      />
                      <Bar dataKey="退款额" fill="#e11d48" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-slate-400">区间内无明显退款</p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">经营建议</h3>
                <p className="text-xs text-slate-400">根据成交、退款与客群自动生成，可复制全文</p>
              </div>
              <button
                type="button"
                className="text-xs text-indigo-600 hover:underline"
                onClick={() => {
                  void navigator.clipboard.writeText(advice)
                }}
              >
                复制报告
              </button>
            </div>
            <div className="space-y-4">
              {sections.length ? (
                sections.map((sec) => (
                  <div key={sec.title} className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3">
                    <h4 className="text-sm font-semibold text-slate-800">{sec.title}</h4>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
                      {sec.body || '（本节暂无要点）'}
                    </pre>
                  </div>
                ))
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">{advice}</pre>
              )}
            </div>
            <p className="mt-4 text-xs text-slate-400">
              说明：新客/复购按本店历史 open_id 推算；毛利为商家自填比例估算；竞对成交无法从平台 API 获取。
            </p>
          </section>
        </div>
      ) : null}
    </ModulePage>
  )
}
