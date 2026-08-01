import { Download, Loader2, PieChart, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMembership } from '../context/MembershipContext'
import { listMerchantBindings } from '../lib/merchantPlatformBindings'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import {
  appendTaxFilingRecord,
  buildTaxExportBlob,
  buildTaxPlatformRows,
  readTaxFilingHistory,
  resolveTaxFilingIndustryContext,
  shanghaiMonthRangeYmd,
  type TaxFilingIndustryContext,
  type TaxPlatformRow,
} from '../lib/taxFiling'
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
import { readStorePlatformMargins, readStoreMarginConfig, type StorePlatformMargins } from '../lib/storeMarginsRead'
import {
  fetchFinanceReconcile,
  type FinancePlatformId,
  type FinanceReconcileRow,
} from '../services/financeReconcileApi'
import {
  listMerchantOrders,
  syncMerchantOrders,
  type MerchantOrderRow,
} from '../services/merchantOrdersApi'
import ModulePage from './ModulePage'

const PIE_COLORS = ['#2563eb', '#ea580c', '#16a34a']

function formatYuan(n: number): string {
  if (!Number.isFinite(n)) return '¥0'
  return `¥${Math.round(n).toLocaleString('zh-CN')}`
}

function marginForPlatform(margins: StorePlatformMargins, p: FinancePlatformId): number {
  if (p === 'douyin') return margins.douyin
  if (p === 'meituan' || p === 'meituan_waimai') return margins.meituan
  if (p === 'xhs' || p === 'eleme' || p === 'jd_waimai') return margins.xhs
  return margins.douyin
}

function shanghaiTodayYmd(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

function addCalendarDaysShanghai(ymd: string, deltaDays: number): string {
  const ms = new Date(`${ymd}T12:00:00+08:00`).getTime() + deltaDays * 86_400_000
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

type DayRangePreset = 7 | 15 | 30
type PlatformView = 'all' | 'groupbuy' | 'waimai' | FinancePlatformId

const PLATFORM_FILTER_OPTIONS: { value: PlatformView; label: string }[] = [
  { value: 'all', label: '全部平台' },
  { value: 'groupbuy', label: '团购平台' },
  { value: 'waimai', label: '外卖平台' },
  { value: 'douyin', label: '抖音来客' },
  { value: 'meituan', label: '美团点评' },
  { value: 'xhs', label: '小红书' },
  { value: 'eleme', label: '淘宝闪购' },
  { value: 'meituan_waimai', label: '美团外卖' },
  { value: 'jd_waimai', label: '京东外卖' },
]

export function FinanceReconcilePage() {
  const [rows, setRows] = useState<FinanceReconcileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [margins, setMargins] = useState<StorePlatformMargins>(() => readStorePlatformMargins())
  const [dayRange, setDayRange] = useState<DayRangePreset>(7)
  const [rangeMode, setRangeMode] = useState<'preset' | 'custom'>('preset')
  const [customStart, setCustomStart] = useState(() => addCalendarDaysShanghai(shanghaiTodayYmd(), -6))
  const [customEnd, setCustomEnd] = useState(() => shanghaiTodayYmd())
  const [apiWarnings, setApiWarnings] = useState<string[]>([])
  const [resolvedRange, setResolvedRange] = useState<{ start?: string; end?: string }>({})
  const [platformFilter, setPlatformFilter] = useState<PlatformView>('all')
  const [viewTab, setViewTab] = useState<'daily' | 'orders'>('daily')
  const [orderRows, setOrderRows] = useState<MerchantOrderRow[]>([])
  const [orderTotal, setOrderTotal] = useState(0)
  const [orderPage, setOrderPage] = useState(1)
  const [orderQ, setOrderQ] = useState('')
  const [orderLoading, setOrderLoading] = useState(false)
  const [orderErr, setOrderErr] = useState('')
  const [orderSyncing, setOrderSyncing] = useState(false)

  const orderRange = useMemo(() => {
    if (rangeMode === 'custom') return { start: customStart, end: customEnd }
    const end = shanghaiTodayYmd()
    return { start: addCalendarDaysShanghai(end, -(dayRange - 1)), end }
  }, [rangeMode, customStart, customEnd, dayRange])

  const loadOrders = useCallback(async () => {
    setOrderLoading(true)
    setOrderErr('')
    try {
      const plat =
        platformFilter === 'douyin' || platformFilter === 'all' || platformFilter === 'groupbuy'
          ? platformFilter === 'all' || platformFilter === 'groupbuy'
            ? 'douyin'
            : platformFilter
          : 'douyin'
      const r = await listMerchantOrders({
        platform: plat,
        startDate: orderRange.start,
        endDate: orderRange.end,
        q: orderQ.trim() || undefined,
        page: orderPage,
        pageSize: 30,
      })
      setOrderRows(r.rows)
      setOrderTotal(r.total)
    } catch (e) {
      setOrderErr(e instanceof Error ? e.message : '订单明细加载失败')
      setOrderRows([])
      setOrderTotal(0)
    } finally {
      setOrderLoading(false)
    }
  }, [platformFilter, orderRange.start, orderRange.end, orderQ, orderPage])

  const syncAndLoadOrders = useCallback(async () => {
    setOrderSyncing(true)
    try {
      await syncMerchantOrders({ startDate: orderRange.start, endDate: orderRange.end })
    } catch {
      /* 仍尝试读库 */
    } finally {
      setOrderSyncing(false)
    }
    await loadOrders()
  }, [orderRange.start, orderRange.end, loadOrders])

  useEffect(() => {
    if (viewTab === 'orders') void loadOrders()
  }, [viewTab, loadOrders])

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      if (rangeMode === 'custom') {
        if (!customStart || !customEnd || customStart > customEnd) {
          setErr('请选择有效的自定义起止日期')
          setRows([])
          setApiWarnings([])
          setResolvedRange({})
          return
        }
        const t0 = new Date(`${customStart}T12:00:00+08:00`).getTime()
        const t1 = new Date(`${customEnd}T12:00:00+08:00`).getTime()
        const spanDays = Math.floor((t1 - t0) / 86_400_000) + 1
        if (spanDays > 90) {
          setErr('自定义区间最长 90 天')
          setRows([])
          setApiWarnings([])
          setResolvedRange({})
          return
        }
      }
      const r =
        rangeMode === 'custom'
          ? await fetchFinanceReconcile({ startDate: customStart, endDate: customEnd })
          : await fetchFinanceReconcile({ days: dayRange })
      if (!r.ok) {
        setErr(r.message)
        setRows([])
        setApiWarnings([])
        setResolvedRange({})
        return
      }
      setRows(r.rows)
      setFetchedAt(r.fetchedAt)
      setApiWarnings(r.warnings ?? [])
      setResolvedRange({ start: r.startDate, end: r.endDate })
    } finally {
      setLoading(false)
    }
  }, [dayRange, rangeMode, customStart, customEnd])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === 'meoo_store_margin_config_v1' ||
        e.key === 'meoo_store_gross_margins_v1' ||
        e.key === null
      ) {
        setMargins(readStorePlatformMargins())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const refreshMargins = useCallback(() => {
    setMargins(readStorePlatformMargins())
  }, [])

  const enriched = useMemo(() => {
    return rows.map((r) => {
      const marginPct = marginForPlatform(margins, r.platform)
      const estimatedGrossYuan = (r.verifyAmountYuan * marginPct) / 100
      return { ...r, marginPct, estimatedGrossYuan }
    })
  }, [rows, margins])

  const filteredEnriched = useMemo(() => {
    if (platformFilter === 'all') return enriched
    if (platformFilter === 'groupbuy') return enriched.filter((r) => r.channel === 'groupbuy')
    if (platformFilter === 'waimai') return enriched.filter((r) => r.channel === 'waimai')
    return enriched.filter((r) => r.platform === platformFilter)
  }, [enriched, platformFilter])

  const totals = useMemo(() => {
    let orders = 0
    let verifyOrders = 0
    let sales = 0
    let verify = 0
    let gross = 0
    for (const r of filteredEnriched) {
      orders += r.orderCount
      verifyOrders += r.verifyOrderCount
      sales += r.salesAmountYuan
      verify += r.verifyAmountYuan
      gross += r.estimatedGrossYuan
    }
    return { orders, verifyOrders, sales, verify, gross }
  }, [filteredEnriched])

  const chartByPlatform = useMemo(() => {
    const m = new Map<string, { name: string; 售卖金额: number; 核销金额: number; 预估毛利: number }>()
    for (const r of filteredEnriched) {
      const name = r.platformLabel || r.platform
      const cur = m.get(name) ?? { name, 售卖金额: 0, 核销金额: 0, 预估毛利: 0 }
      cur.售卖金额 += r.salesAmountYuan
      cur.核销金额 += r.verifyAmountYuan
      cur.预估毛利 += r.estimatedGrossYuan
      m.set(name, cur)
    }
    return Array.from(m.values())
  }, [filteredEnriched])

  const chartDaily = useMemo(() => {
    const m = new Map<string, { date: string; 核销金额: number; 售卖金额: number }>()
    for (const r of filteredEnriched) {
      const cur = m.get(r.date) ?? { date: r.date, 核销金额: 0, 售卖金额: 0 }
      cur.核销金额 += r.verifyAmountYuan
      cur.售卖金额 += r.salesAmountYuan
      m.set(r.date, cur)
    }
    return Array.from(m.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [filteredEnriched])

  const pieVerifyShare = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of filteredEnriched) {
      const name = r.platformLabel || r.platform
      m.set(name, (m.get(name) ?? 0) + r.verifyAmountYuan)
    }
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }))
  }, [filteredEnriched])

  const exportCsv = useCallback(() => {
    const header = [
      '日期',
      '平台',
      '订单数',
      '核销订单数',
      '售卖金额(元)',
      '核销金额(元)',
      '配置毛利率(%)',
      '预估毛利-核销口径(元)',
    ]
    const lines = [
      header.join(','),
      ...filteredEnriched.map((r) =>
        [
          r.date,
          r.platformLabel,
          r.orderCount,
          r.verifyOrderCount,
          r.salesAmountYuan.toFixed(2),
          r.verifyAmountYuan.toFixed(2),
          r.marginPct,
          r.estimatedGrossYuan.toFixed(2),
        ].join(','),
      ),
    ]
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `财务对账-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [filteredEnriched])

  return (
    <ModulePage
      title="财务对账"
      subtitle="支持抖音、大众点评、小红书等平台对账数据（需先在系统设置完成各平台绑定）。订单、核销与金额会与「商品列表」中的门店毛利率结合，粗算预估毛利，仅供参考。"
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            刷新数据
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filteredEnriched.length === 0}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Download className="mr-2 h-4 w-4" />
            导出对账表
          </button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setViewTab('daily')}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium',
            viewTab === 'daily' ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-700',
          )}
        >
          按日汇总
        </button>
        <button
          type="button"
          onClick={() => setViewTab('orders')}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium',
            viewTab === 'orders' ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-700',
          )}
        >
          订单明细
        </button>
      </div>

      {viewTab === 'orders' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-slate-600">
              搜索
              <input
                value={orderQ}
                onChange={(e) => {
                  setOrderPage(1)
                  setOrderQ(e.target.value)
                }}
                placeholder="订单号 / 商品名"
                className="mt-1 block min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={orderLoading || orderSyncing}
              onClick={() => void syncAndLoadOrders()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {orderSyncing || orderLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              同步抖音订单并刷新
            </button>
            <p className="text-xs text-slate-500">
              区间 {orderRange.start} ~ {orderRange.end} · 共 {orderTotal} 笔（一期支持抖音来客）
            </p>
          </div>
          {orderErr ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {orderErr}
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">支付时间</th>
                  <th className="px-3 py-2">平台</th>
                  <th className="px-3 py-2">订单号</th>
                  <th className="px-3 py-2">商品</th>
                  <th className="px-3 py-2">金额</th>
                  <th className="px-3 py-2">退款</th>
                  <th className="px-3 py-2">状态</th>
                </tr>
              </thead>
              <tbody>
                {orderRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                      {orderLoading ? '加载中…' : '暂无逐单，请先同步抖音订单'}
                    </td>
                  </tr>
                ) : (
                  orderRows.map((o) => (
                    <tr key={o.id} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">
                        {o.payTime ? new Date(o.payTime).toLocaleString('zh-CN') : '—'}
                      </td>
                      <td className="px-3 py-2">{o.platform}</td>
                      <td className="px-3 py-2 font-mono text-xs">{o.orderId}</td>
                      <td className="max-w-[240px] truncate px-3 py-2" title={o.skuName}>
                        {o.skuName}
                      </td>
                      <td className="px-3 py-2">{formatYuan(o.payAmountFen / 100)}</td>
                      <td className="px-3 py-2">{formatYuan(o.refundAmountFen / 100)}</td>
                      <td className="px-3 py-2">{o.orderStatus ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              disabled={orderPage <= 1}
              onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
              className="rounded border px-2 py-1 disabled:opacity-40"
            >
              上一页
            </button>
            <span>
              第 {orderPage} 页 / 共 {Math.max(1, Math.ceil(orderTotal / 30))} 页
            </span>
            <button
              type="button"
              disabled={orderPage * 30 >= orderTotal}
              onClick={() => setOrderPage((p) => p + 1)}
              className="rounded border px-2 py-1 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      ) : null}

      {viewTab === 'daily' ? (
      <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4 rounded-lg border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
        <div className="min-w-0 flex-1">
          <span className="font-medium">毛利率来源：</span>
          与「商品列表」页
          <Link to="/products/list" className="mx-1 font-medium text-blue-700 underline">
            门店综合毛利率
          </Link>
          配置一致（抖音 / 美团 / 小红书）。
          <button type="button" onClick={refreshMargins} className="ml-2 text-blue-700 underline">
            重新读取配置
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="finance-platform-filter" className="mb-1 block text-xs font-medium text-amber-900/85">
              平台筛选
            </label>
            <select
              id="finance-platform-filter"
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value as PlatformView)}
              className="min-w-[10.5rem] rounded-lg border border-amber-200/80 bg-white px-2.5 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {PLATFORM_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-amber-900/85">日期范围</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {([7, 15, 30] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setRangeMode('preset')
                    setDayRange(d)
                  }}
                  disabled={loading}
                  className={cn(
                    'rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50',
                    rangeMode === 'preset' && dayRange === d
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'border border-amber-200/80 bg-white text-gray-800 hover:bg-amber-100/50',
                  )}
                >
                  {d} 天
                </button>
              ))}
              <button
                type="button"
                onClick={() => setRangeMode('custom')}
                disabled={loading}
                className={cn(
                  'rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50',
                  rangeMode === 'custom'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'border border-amber-200/80 bg-white text-gray-800 hover:bg-amber-100/50',
                )}
              >
                自定义
              </button>
              {rangeMode === 'custom' ? (
                <span className="flex flex-wrap items-center gap-2 pl-1">
                  <label className="inline-flex items-center gap-1 text-xs text-amber-900/90">
                    <span className="whitespace-nowrap">起</span>
                    <input
                      type="date"
                      value={customStart}
                      max={customEnd}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="rounded border border-amber-200/90 bg-white px-2 py-1.5 text-xs text-gray-900 shadow-sm"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1 text-xs text-amber-900/90">
                    <span className="whitespace-nowrap">止</span>
                    <input
                      type="date"
                      value={customEnd}
                      min={customStart}
                      max={shanghaiTodayYmd()}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="rounded border border-amber-200/90 bg-white px-2 py-1.5 text-xs text-gray-900 shadow-sm"
                    />
                  </label>
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {fetchedAt ? (
        <p className="mb-4 text-xs text-gray-500">
          数据拉取时间：{new Date(fetchedAt).toLocaleString('zh-CN', { hour12: false })}
          <span className="mx-2 text-gray-300">|</span>
          总览范围：
          {rangeMode === 'custom' && resolvedRange.start && resolvedRange.end
            ? `${resolvedRange.start} ~ ${resolvedRange.end}`
            : `近 ${dayRange} 天`}
          <span className="mx-2 text-gray-300">|</span>
          {PLATFORM_FILTER_OPTIONS.find((o) => o.value === platformFilter)?.label ?? '全部平台'}
        </p>
      ) : null}

      {apiWarnings.length > 0 ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs text-amber-950">
          <div className="font-medium text-amber-900">数据说明</div>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {apiWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {err ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: '订单数', value: totals.orders, tone: 'text-gray-900' },
          { label: '核销订单数', value: totals.verifyOrders, tone: 'text-indigo-700' },
          { label: '售卖金额', value: formatYuan(totals.sales), tone: 'text-blue-700' },
          { label: '核销金额', value: formatYuan(totals.verify), tone: 'text-emerald-700' },
          { label: '预估毛利(核销×毛利率)', value: formatYuan(totals.gross), tone: 'text-amber-800' },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-gray-500">{c.label}</div>
            <div className={cn('mt-1 text-lg font-semibold tabular-nums', c.tone)}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <PieChart className="h-4 w-4 text-blue-600" aria-hidden />
            各平台金额对比（累计）
          </h3>
          <p className="mb-2 text-xs text-gray-500">售卖金额 vs 核销金额 vs 预估毛利（按当前毛利率）</p>
          <div className="h-72 w-full min-h-[16rem]">
            {chartByPlatform.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartByPlatform} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v) => formatYuan(Number(v ?? 0))} />
                  <Legend />
                  <Bar dataKey="售卖金额" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="核销金额" fill="#34d399" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="预估毛利" fill="#fcd34d" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">暂无数据</div>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-gray-900">核销金额按日趋势</h3>
          <p className="mb-2 text-xs text-gray-500">按日汇总当前筛选范围内的售卖与核销金额</p>
          <div className="h-72 w-full min-h-[16rem]">
            {chartDaily.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDaily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v) => formatYuan(Number(v ?? 0))} />
                  <Legend />
                  <Bar dataKey="核销金额" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="售卖金额" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">暂无数据</div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <PieChart className="h-4 w-4 text-violet-600" aria-hidden />
          核销金额占比（平台）
        </h3>
        <div className="mx-auto h-56 w-full max-w-sm">
          {pieVerifyShare.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPie>
                <Pie
                  data={pieVerifyShare}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={72}
                  label={({ name, percent }) => `${name} ${(((percent ?? 0) as number) * 100).toFixed(0)}%`}
                >
                  {pieVerifyShare.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatYuan(Number(v ?? 0))} />
              </RechartsPie>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">暂无数据</div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            正在拉取对账数据…
          </div>
        ) : (
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-3">日期</th>
                <th className="px-3 py-3">平台</th>
                <th className="px-3 py-3 text-right">订单数</th>
                <th className="px-3 py-3 text-right">核销订单数</th>
                <th className="px-3 py-3 text-right">售卖金额</th>
                <th className="px-3 py-3 text-right">核销金额</th>
                <th className="px-3 py-3 text-right">配置毛利率</th>
                <th className="px-3 py-3 text-right">预估毛利</th>
              </tr>
            </thead>
            <tbody>
              {filteredEnriched.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                    暂无对账明细。可尝试调整日期或平台筛选后刷新。
                  </td>
                </tr>
              ) : (
                filteredEnriched.map((r, idx) => (
                  <tr key={`${r.date}-${r.platform}-${idx}`} className="border-b border-gray-50 hover:bg-gray-50/80">
                    <td className="px-3 py-2.5 tabular-nums text-gray-900">{r.date}</td>
                    <td className="px-3 py-2.5 text-gray-900">{r.platformLabel}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.orderCount}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-indigo-700">{r.verifyOrderCount}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatYuan(r.salesAmountYuan)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-emerald-800">
                      {formatYuan(r.verifyAmountYuan)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{r.marginPct}%</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-800">
                      {formatYuan(r.estimatedGrossYuan)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-gray-500">
        说明：预估毛利按「核销金额 × 商品页该渠道综合毛利率」粗算，未扣平台佣金、退款与税费；正式结算以各平台对账单与财务规则为准。美团、小红书等渠道的对账展示将随后续版本接入。
      </p>
      </>
      ) : null}
    </ModulePage>
  )
}

export function FinanceTaxPage() {
  const { entitlements } = useMembership()
  const [periodOffset, setPeriodOffset] = useState(-1)
  const [rows, setRows] = useState<TaxPlatformRow[]>([])
  const [industryCtx, setIndustryCtx] = useState<TaxFilingIndustryContext>(() =>
    resolveTaxFilingIndustryContext(readStoreMarginConfig().industry),
  )
  const [history, setHistory] = useState(() => readTaxFilingHistory())
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [filingBusy, setFilingBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const period = useMemo(() => shanghaiMonthRangeYmd(periodOffset), [periodOffset])
  const totalVerify = useMemo(
    () => rows.reduce((s, r) => s + r.verifyAmountYuan, 0),
    [rows],
  )
  const totalCommission = useMemo(
    () => rows.reduce((s, r) => s + r.commissionAmountYuan, 0),
    [rows],
  )
  const boundCount = useMemo(
    () => rows.filter((r) => r.bindingStatus !== 'unbound').length,
    [rows],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const marginConfig = readStoreMarginConfig()
      const industry = resolveTaxFilingIndustryContext(marginConfig.industry)
      setIndustryCtx(industry)
      let bindings: Awaited<ReturnType<typeof listMerchantBindings>> = []
      if (supabaseConfigured && supabase) {
        const [dy, xhs] = await Promise.all([
          listMerchantBindings(supabase, 'douyin'),
          listMerchantBindings(supabase, 'xhs_commercial'),
        ])
        bindings = [...dy, ...xhs]
      }
      const fin = await fetchFinanceReconcile({ startDate: period.start, endDate: period.end })
      if (!fin.ok) {
        setErr(fin.message)
        setRows([])
        return
      }
      setRows(buildTaxPlatformRows(bindings, fin.rows, marginConfig.industry))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [period.start, period.end])

  useEffect(() => {
    void load()
  }, [load])

  const exportOnly = () => {
    const blob = buildTaxExportBlob(rows, period, industryCtx)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `meoo-tax-${period.start}-${period.end}.json`
    a.click()
    URL.revokeObjectURL(url)
    setToast('报税数据已导出')
  }

  const oneClickFile = async () => {
    if (!rows.length) {
      setToast('暂无对账数据，请先完成平台绑定并拉取财务对账')
      return
    }
    setFilingBusy(true)
    try {
      exportOnly()
      appendTaxFilingRecord({
        id: `TAX-${Date.now()}`,
        periodLabel: period.label,
        startDate: period.start,
        endDate: period.end,
        submittedAt: new Date().toISOString(),
        platforms: rows.map((r) => ({
          platformId: r.platformId,
          verifyAmountYuan: r.verifyAmountYuan,
        })),
        totalVerifyYuan: totalVerify,
        status: 'submitted_mock',
      })
      setHistory(readTaxFilingHistory())
      setToast('一键报税完成：数据包已下载，申报记录已保存（正式税局接口可后续对接）')
    } finally {
      setFilingBusy(false)
    }
  }

  if (!entitlements.features.financeTax) {
    return (
      <ModulePage title="报税管理" subtitle="会员功能">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          免费版不包含报税管理。升级会员版后可按已绑定平台汇总对账数据并一键导出申报包。
        </div>
      </ModulePage>
    )
  }

  return (
    <ModulePage
      title="报税管理"
      subtitle="按已绑定线上平台汇总对账核销数据，支持导出与一键报税（申报包）"
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            刷新
          </button>
          <button
            type="button"
            onClick={exportOnly}
            disabled={loading || !rows.length}
            className="flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="mr-2 h-4 w-4" />
            导出数据包
          </button>
          <button
            type="button"
            onClick={() => void oneClickFile()}
            disabled={loading || filingBusy || !rows.length}
            className="flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {filingBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PieChart className="mr-2 h-4 w-4" />}
            一键报税
          </button>
        </div>
      }
    >
      {toast ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {toast}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">申报周期</label>
        <select
          value={periodOffset}
          onChange={(e) => setPeriodOffset(Number(e.target.value))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value={-1}>上一自然月</option>
          <option value={0}>本月至今</option>
        </select>
        <span className="text-sm text-gray-500">
          {period.label}（{period.start} ~ {period.end}）· 已绑定 {boundCount} 个平台 · 核销合计{' '}
          <span className="font-semibold tabular-nums">{formatYuan(totalVerify)}</span>
          {' · '}
          平台佣金合计{' '}
          <span className="font-semibold tabular-nums text-amber-800">{formatYuan(totalCommission)}</span>
        </span>
      </div>

      <p className="mb-4 text-xs text-gray-500">
        经营行业（来自商品页门店毛利配置）：{industryCtx.path || industryCtx.presetPath}
        {!industryCtx.code ? (
          <>
            {' '}
            · 未配置时将按默认餐饮类目佣金率估算，可在{' '}
            <Link to="/products" className="text-indigo-600 hover:underline">
              商品列表
            </Link>{' '}
            设置行业与毛利率
          </>
        ) : null}
      </p>

      {err ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {err}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">平台</th>
              <th className="px-4 py-3">渠道</th>
              <th className="px-4 py-3">绑定状态</th>
              <th className="px-4 py-3 text-right">订单数</th>
              <th className="px-4 py-3 text-right">核销额</th>
              <th className="px-4 py-3 text-right">销售额</th>
              <th className="px-4 py-3 text-right">行业佣金率</th>
              <th className="px-4 py-3 text-right">平台佣金</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500" />
                  <p className="mt-2">正在拉取对账与绑定信息…</p>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                  暂无数据。请先在系统设置完成平台绑定，并确保财务对账接口可用。
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.platformId} className="hover:bg-gray-50/80">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.platformLabel}</td>
                  <td className="px-4 py-3 text-gray-600">{r.channel === 'waimai' ? '外卖' : '团购'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        r.bindingStatus === 'bound'
                          ? 'bg-emerald-100 text-emerald-800'
                          : r.bindingStatus === 'session_only'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {r.bindingLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.orderCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-800">
                    {formatYuan(r.verifyAmountYuan)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                    {formatYuan(r.salesAmountYuan)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.commissionRatePct}%</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-amber-800">
                    {formatYuan(r.commissionAmountYuan)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">申报记录</h3>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">暂无记录。点击「一键报税」后将在此展示。</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-gray-700">
            {history.slice(0, 8).map((h) => (
              <li key={h.id} className="flex flex-wrap justify-between gap-2 border-b border-gray-100 pb-2">
                <span>
                  {h.periodLabel} · {h.platforms.length} 个平台
                </span>
                <span className="tabular-nums text-gray-500">
                  核销 {formatYuan(h.totalVerifyYuan)} · {new Date(h.submittedAt).toLocaleString('zh-CN')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-gray-500">
        说明：核销额来自「财务对账」各平台汇总；平台佣金按当前门店行业（商品页毛利配置）× 各平台参考费率粗算（核销额×佣金率），未含达人分佣、活动补贴与退款。一键报税导出 JSON
        申报包并记录状态；对接各平台税务开放接口后可替换为真实申报提交。
      </p>
    </ModulePage>
  )
}
