import { BarChart3, Download, FileSpreadsheet, Filter, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../cn'
import {
  computeErpBreakdownByKind,
  computeErpBreakdownByPlan,
  computeErpDailyConfirmedRevenue,
  computeErpFinanceSummary,
  downloadErpFinanceCsv,
  downloadErpFinanceXlsx,
  erpFinanceKindLabel,
  erpFinancePayChannelLabel,
  erpFinancePeriodLabel,
  erpFinancePlanLabel,
  erpFinanceStatusLabel,
  fetchErpFinanceRows,
  filterErpFinanceRows,
  yuan,
  type ErpFinanceBreakdownSlice,
  type ErpFinanceDailyRevenue,
  type ErpFinanceKind,
  type ErpFinanceStatus,
} from '../opsErpFinanceApi'
import type { OpsPaymentOrderRow } from '../opsPaymentOrdersApi'
import OpsPageHero from '../OpsPageHero'

type StatusFilter = 'all' | ErpFinanceStatus
type KindFilter = 'all' | ErpFinanceKind
type PlanFilter = 'all' | string

const PLAN_OPTIONS: { value: string; label: string }[] = [
  { value: 'member', label: '会员版' },
  { value: 'member_store', label: '进阶版' },
  { value: 'member_plus', label: '会员 Plus' },
  { value: 'recharge', label: '充值' },
]

function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysAgoYmd(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

function statusClass(status: ErpFinanceStatus): string {
  if (status === 'confirmed') return 'bg-emerald-500/15 text-emerald-300'
  if (status === 'amount_verified') return 'bg-sky-500/15 text-sky-300'
  if (status === 'cancelled') return 'bg-slate-600 text-slate-300'
  return 'bg-amber-500/15 text-amber-300'
}

function kindClass(kind: ErpFinanceKind): string {
  if (kind === 'recharge') return 'font-semibold text-emerald-300'
  if (kind === 'subscription') return 'font-semibold text-orange-300'
  return 'font-semibold text-red-300'
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-4">
      <p className="text-xs text-[var(--ops-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {sub ? <p className="mt-1 text-xs text-[var(--ops-muted)]">{sub}</p> : null}
    </div>
  )
}

function BreakdownBars({ title, slices }: { title: string; slices: ErpFinanceBreakdownSlice[] }) {
  const max = Math.max(...slices.map((s) => s.cents), 1)
  if (!slices.length) {
    return (
      <div className="rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-4">
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="mt-4 py-6 text-center text-xs text-slate-500">筛选范围内暂无已到账收入</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-4">
      <p className="text-sm font-medium text-white">{title}</p>
      <ul className="mt-4 space-y-3">
        {slices.map((slice) => (
          <li key={slice.key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-slate-300">{slice.label}</span>
              <span className="tabular-nums text-slate-400">
                ¥{yuan(slice.cents)} · {slice.count} 笔
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-500/80"
                style={{ width: `${Math.max(4, (slice.cents / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DailyRevenueChart({ points }: { points: ErpFinanceDailyRevenue[] }) {
  const max = Math.max(...points.map((p) => p.cents), 1)
  if (!points.length) {
    return (
      <div className="rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-4">
        <p className="text-sm font-medium text-white">日收入趋势（已到账）</p>
        <p className="mt-4 py-10 text-center text-xs text-slate-500">筛选范围内暂无已到账收入</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-4">
      <p className="text-sm font-medium text-white">日收入趋势（已到账）</p>
      <div className="mt-4 flex items-end gap-1 overflow-x-auto pb-1" style={{ minHeight: '9rem' }}>
        {points.map((p) => (
          <div key={p.date} className="flex min-w-[2.5rem] flex-1 flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-slate-500">{p.count > 0 ? p.count : ''}</span>
            <div
              className="w-full max-w-[3rem] rounded-t bg-emerald-500/70"
              style={{ height: `${Math.max(8, (p.cents / max) * 96)}px` }}
              title={`${p.date} · ¥${yuan(p.cents)} · ${p.count} 笔`}
            />
            <span className="text-[10px] text-slate-500">{p.date.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function OpsErpFinancePage() {
  const [rows, setRows] = useState<OpsPaymentOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all')

  const load = useCallback(async () => {
    setErr(null)
    setLoading(true)
    try {
      setRows(await fetchErpFinanceRows())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 15000)
    return () => window.clearInterval(t)
  }, [load])

  const filteredRows = useMemo(
    () =>
      filterErpFinanceRows(rows, {
        rangeStart,
        rangeEnd,
        status: statusFilter,
        kind: kindFilter,
        planKey: planFilter,
      }),
    [rows, rangeStart, rangeEnd, statusFilter, kindFilter, planFilter],
  )

  const summary = useMemo(
    () => computeErpFinanceSummary(rows, rangeStart, rangeEnd),
    [rows, rangeStart, rangeEnd],
  )
  const dailyRevenue = useMemo(
    () => computeErpDailyConfirmedRevenue(filteredRows, rangeStart, rangeEnd),
    [filteredRows, rangeStart, rangeEnd],
  )
  const breakdownByKind = useMemo(
    () => computeErpBreakdownByKind(filteredRows, rangeStart, rangeEnd),
    [filteredRows, rangeStart, rangeEnd],
  )
  const breakdownByPlan = useMemo(
    () => computeErpBreakdownByPlan(filteredRows, rangeStart, rangeEnd),
    [filteredRows, rangeStart, rangeEnd],
  )

  const filtersActive =
    Boolean(rangeStart || rangeEnd) || statusFilter !== 'all' || kindFilter !== 'all' || planFilter !== 'all'

  const resetFilters = () => {
    setRangeStart('')
    setRangeEnd('')
    setStatusFilter('all')
    setKindFilter('all')
    setPlanFilter('all')
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <OpsPageHero
        heroKey="erp-finance"
        trailing={
          <>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm text-white backdrop-blur-sm hover:bg-white/20"
              onClick={() => void load()}
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              刷新
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm text-white backdrop-blur-sm hover:bg-white/20 disabled:opacity-40"
              disabled={filteredRows.length === 0}
              onClick={() => downloadErpFinanceCsv(filteredRows)}
            >
              <Download className="h-4 w-4" />
              下载 CSV
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm text-white backdrop-blur-sm hover:bg-white/20 disabled:opacity-40"
              disabled={filteredRows.length === 0}
              onClick={() => downloadErpFinanceXlsx(filteredRows)}
            >
              <FileSpreadsheet className="h-4 w-4" />
              下载 Excel
            </button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="已到账收入（开通 + 充值）"
          value={`¥${yuan(summary.totalConfirmedCents)}`}
          sub={`${summary.openCount} 笔开通 · ${summary.rechargeCount} 笔充值 · ${summary.openTenantCount} 家商家`}
        />
        <SummaryCard
          label="待处理金额"
          value={`¥${yuan(summary.totalPendingCents)}`}
          sub={`${summary.pendingCount} 笔待核对或已核对`}
        />
        <SummaryCard label="今日已收" value={`¥${yuan(summary.todayConfirmedCents)}`} />
        <SummaryCard label="本月已收" value={`¥${yuan(summary.monthConfirmedCents)}`} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <BarChart3 className="h-4 w-4 text-indigo-400" />
          汇总图表（跟随上方筛选；只统计已到账的开通和充值）
        </div>
        <DailyRevenueChart points={dailyRevenue} />
        <div className="grid gap-3 lg:grid-cols-2">
          <BreakdownBars title="按类型汇总" slices={breakdownByKind} />
          <BreakdownBars title="按档位汇总" slices={breakdownByPlan} />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--ops-border)] bg-[var(--ops-panel)] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-slate-500" />
          <input
            type="date"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            className="rounded-lg border border-[var(--ops-border)] bg-[var(--ops-bg)] px-2 py-1.5 text-sm text-slate-200"
          />
          <span className="text-slate-500">—</span>
          <input
            type="date"
            value={rangeEnd}
            onChange={(e) => setRangeEnd(e.target.value)}
            className="rounded-lg border border-[var(--ops-border)] bg-[var(--ops-bg)] px-2 py-1.5 text-sm text-slate-200"
          />
          <button
            type="button"
            className="rounded-lg border border-[var(--ops-border)] px-2 py-1.5 text-xs text-slate-400 hover:text-white"
            onClick={() => {
              setRangeStart(daysAgoYmd(6))
              setRangeEnd(todayYmd())
            }}
          >
            近7天
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--ops-border)] px-2 py-1.5 text-xs text-slate-400 hover:text-white"
            onClick={() => {
              setRangeStart(`${todayYmd().slice(0, 7)}-01`)
              setRangeEnd(todayYmd())
            }}
          >
            本月
          </button>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-[var(--ops-border)] bg-[var(--ops-bg)] px-2 py-1.5 text-sm text-slate-200"
          >
            <option value="all">全部状态</option>
            <option value="confirmed">已到账</option>
            <option value="amount_verified">已核对</option>
            <option value="pending">待核对</option>
            <option value="cancelled">已取消</option>
          </select>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as KindFilter)}
            className="rounded-lg border border-[var(--ops-border)] bg-[var(--ops-bg)] px-2 py-1.5 text-sm text-slate-200"
          >
            <option value="all">全部类型</option>
            <option value="subscription">开通</option>
            <option value="recharge">充值</option>
            <option value="refund">退款</option>
          </select>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="rounded-lg border border-[var(--ops-border)] bg-[var(--ops-bg)] px-2 py-1.5 text-sm text-slate-200"
          >
            <option value="all">全部档位</option>
            {PLAN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {filtersActive ? (
            <button type="button" className="text-xs text-indigo-300 hover:text-indigo-200" onClick={resetFilters}>
              清除筛选
            </button>
          ) : null}
        </div>

        {err ? <p className="mb-3 text-sm text-red-400">{err}</p> : null}
        {loading && rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">加载中…</p>
        ) : filteredRows.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">暂无符合条件的商家支付记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--ops-border)] text-xs text-slate-500">
                  <th className="px-2 py-2 font-medium">创建时间</th>
                  <th className="px-2 py-2 font-medium">商家</th>
                  <th className="px-2 py-2 font-medium">类型</th>
                  <th className="px-2 py-2 font-medium">档位</th>
                  <th className="px-2 py-2 font-medium">周期</th>
                  <th className="px-2 py-2 font-medium">金额</th>
                  <th className="px-2 py-2 font-medium">支付渠道</th>
                  <th className="px-2 py-2 font-medium">状态</th>
                  <th className="px-2 py-2 font-medium">到账时间</th>
                  <th className="px-2 py-2 font-medium">入账</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--ops-border)]/60 text-slate-200">
                    <td className="whitespace-nowrap px-2 py-2.5 text-xs text-slate-400">{fmtTime(row.created_at)}</td>
                    <td className="px-2 py-2.5">
                      <div className="font-medium">{row.merchant_name || '—'}</div>
                      <Link
                        to={`/customers/${row.tenant_id}`}
                        className="text-xs text-indigo-300 hover:text-indigo-200 hover:underline"
                      >
                        {row.tenant_login_name || '客户详情'}
                      </Link>
                    </td>
                    <td className={cn('px-2 py-2.5', kindClass(row.order_kind))}>
                      {erpFinanceKindLabel(row.order_kind)}
                    </td>
                    <td className="px-2 py-2.5">{erpFinancePlanLabel(row)}</td>
                    <td className="px-2 py-2.5">{erpFinancePeriodLabel(row)}</td>
                    <td className="px-2 py-2.5 font-semibold text-emerald-300">
                      {row.order_kind === 'refund' ? '-' : ''}¥{yuan(row.amount_cents)}
                    </td>
                    <td className="px-2 py-2.5 text-xs">{erpFinancePayChannelLabel(row.pay_channel)}</td>
                    <td className="px-2 py-2.5">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs', statusClass(row.status))}>
                        {erpFinanceStatusLabel(row.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-xs text-slate-400">
                      {fmtTime(row.confirmed_at)}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-slate-400">
                      {row.order_kind === 'subscription' && typeof row.extend_days_applied === 'number'
                        ? `+${row.extend_days_applied} 天`
                        : row.order_kind === 'recharge' && typeof row.wallet_credit_cents_applied === 'number'
                          ? `+¥${yuan(row.wallet_credit_cents_applied)}`
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          共 {filteredRows.length} 条（全库 {rows.length} 条）
          {summary.refundConfirmedCents > 0 ? ` · 已到账退款 ¥${yuan(summary.refundConfirmedCents)}` : ''}
          {summary.cancelledCount > 0 ? ` · 已取消 ${summary.cancelledCount} 笔` : ''}
        </p>
      </div>
    </div>
  )
}
