import { Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../cn'
import {
  fetchShopAnalysis,
  syncMerchantOrders,
  type ShopAnalysisSummary,
} from '../services/merchantOrdersApi'
import ModulePage from './ModulePage'

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

  const load = useCallback(async (withSync: boolean) => {
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
  }, [startDate, endDate])

  useEffect(() => {
    void load(true)
  }, [load])

  return (
    <ModulePage
      title="店铺分析"
      subtitle="综合看板 + 经营建议（基于抖音来客逐单；需先绑定抖音并同步订单）"
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
          去财务对账看逐单 →
        </Link>
      </div>

      {err ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>
      ) : null}
      {warnings.length ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {warnings.slice(0, 5).map((w) => (
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
              ['成交额', yuan(summary.salesAmountYuan)],
              ['成交券', String(summary.couponCount)],
              ['退款率', `${summary.refundRate}%`],
              ['复购率', `${summary.repurchaseRate}%`],
              ['新客成交占比', `${summary.newBuyerShare}%`],
              ['新客人数', String(summary.newBuyerCount)],
              ['估算毛利', yuan(summary.estimatedGrossYuan)],
              ['open_id 覆盖', `${summary.openIdCoverage}%`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">{k}</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{v}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">品类结构（二级）</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {summary.categories.length === 0 ? (
                  <li className="text-slate-400">暂无</li>
                ) : (
                  summary.categories.slice(0, 8).map((c) => (
                    <li key={c.name} className="flex justify-between gap-2 border-b border-slate-50 pb-1">
                      <span className="truncate">{c.name}</span>
                      <span className="shrink-0 text-slate-600">
                        {yuan(c.salesYuan)} · {c.share}%
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">成交额 TOP10</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {summary.topBySales.map((p, i) => (
                  <li key={p.productId + i} className="flex justify-between gap-2 border-b border-slate-50 pb-1">
                    <span className="truncate">
                      {i + 1}. {p.name}
                    </span>
                    <span className="shrink-0 text-slate-600">
                      {yuan(p.salesYuan)} · {p.share}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
              <h3 className="text-sm font-semibold text-slate-900">退款 TOP10</h3>
              <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {summary.topByRefund.length === 0 ? (
                  <li className="text-slate-400">区间内无明显退款</li>
                ) : (
                  summary.topByRefund.map((p, i) => (
                    <li key={p.productId + i} className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                      <span className="truncate">
                        {i + 1}. {p.name}
                      </span>
                      <span className={cn('shrink-0', p.refundRate >= 30 ? 'text-rose-600' : 'text-slate-600')}>
                        {yuan(p.refundYuan)} · {p.refundRate}%
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">经营建议</h3>
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
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">{advice}</pre>
            <p className="mt-4 text-xs text-slate-400">
              说明：新客/复购按本店历史 open_id 推算；毛利为商家自填比例估算；竞对成交无法从平台 API 获取，可结合「竞争对手分析」补充。
            </p>
          </section>
        </div>
      ) : null}
    </ModulePage>
  )
}
