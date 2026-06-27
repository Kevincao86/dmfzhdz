import { Filter, RefreshCw, Wallet } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../cn'
import {
  MP_LIBRARY_ROLE_LABEL,
  MP_MEMBERSHIP_TIER_OPTIONS,
  type MpLibraryRole,
  type MpMembershipTier,
} from '../../meooRegistryShared/mpMembershipCatalog'
import {
  computeMpMembershipFinanceSummary,
  fetchMpMembershipFinanceRows,
  filterMpMembershipFinanceRows,
  mpMembershipPayModeLabel,
  mpMembershipPlanLabel,
  mpMembershipRoleLabel,
  mpMembershipStatusLabel,
  type MpMembershipFinanceRow,
  yuan,
} from '../opsMpMembershipFinanceApi'

type StatusFilter = 'all' | MpMembershipFinanceRow['status']
type RoleFilter = 'all' | MpLibraryRole
type PlanFilter = 'all' | string

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

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

function statusClass(status: MpMembershipFinanceRow['status']): string {
  if (status === 'confirmed') return 'bg-emerald-500/15 text-emerald-300'
  if (status === 'rejected') return 'bg-slate-600 text-slate-300'
  return 'bg-amber-500/15 text-amber-300'
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

export default function OpsMpMembershipFinancePage() {
  const [rows, setRows] = useState<MpMembershipFinanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all')

  const load = useCallback(async () => {
    setErr(null)
    setLoading(true)
    try {
      const list = await fetchMpMembershipFinanceRows()
      setRows(list)
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
      filterMpMembershipFinanceRows(rows, {
        rangeStart,
        rangeEnd,
        status: statusFilter,
        role: roleFilter,
        planId: planFilter,
      }),
    [rows, rangeStart, rangeEnd, statusFilter, roleFilter, planFilter],
  )

  const summary = useMemo(
    () => computeMpMembershipFinanceSummary(rows, rangeStart, rangeEnd),
    [rows, rangeStart, rangeEnd],
  )

  const filtersActive =
    Boolean(rangeStart || rangeEnd) ||
    statusFilter !== 'all' ||
    roleFilter !== 'all' ||
    planFilter !== 'all'

  const resetFilters = () => {
    setRangeStart('')
    setRangeEnd('')
    setStatusFilter('all')
    setRoleFilter('all')
    setPlanFilter('all')
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
            <Wallet className="h-5 w-5 text-indigo-400" />
            星选会员财务
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            微信支付成功后自动开通对应会员档位；本页汇总开通记录与收支。
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--ops-border)] px-3 py-2 text-sm text-slate-300 hover:bg-[var(--ops-hover)]"
          onClick={() => void load()}
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          刷新
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="已确认收入（筛选范围内）"
          value={`¥${yuan(summary.totalConfirmedCents)}`}
          sub={`${summary.confirmedCount} 笔已开通`}
        />
        <SummaryCard
          label="待支付金额"
          value={`¥${yuan(summary.totalPendingCents)}`}
          sub={`${summary.pendingCount} 笔待支付`}
        />
        <SummaryCard label="今日已收" value={`¥${yuan(summary.todayConfirmedCents)}`} />
        <SummaryCard label="本月已收" value={`¥${yuan(summary.monthConfirmedCents)}`} />
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
            <option value="confirmed">已开通</option>
            <option value="pending">待支付</option>
            <option value="rejected">已拒绝</option>
          </select>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            className="rounded-lg border border-[var(--ops-border)] bg-[var(--ops-bg)] px-2 py-1.5 text-sm text-slate-200"
          >
            <option value="all">全部身份</option>
            {(Object.keys(MP_LIBRARY_ROLE_LABEL) as MpLibraryRole[]).map((role) => (
              <option key={role} value={role}>
                {MP_LIBRARY_ROLE_LABEL[role]}
              </option>
            ))}
          </select>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value as PlanFilter)}
            className="rounded-lg border border-[var(--ops-border)] bg-[var(--ops-bg)] px-2 py-1.5 text-sm text-slate-200"
          >
            <option value="all">全部档位</option>
            {MP_MEMBERSHIP_TIER_OPTIONS.filter((o: { value: MpMembershipTier; label: string }) => o.value !== 'basic').map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {filtersActive ? (
            <button
              type="button"
              className="text-xs text-indigo-300 hover:text-indigo-200"
              onClick={resetFilters}
            >
              清除筛选
            </button>
          ) : null}
        </div>

        {err ? <p className="mb-3 text-sm text-red-400">{err}</p> : null}
        {loading && rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">加载中…</p>
        ) : filteredRows.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">暂无符合条件的会员支付记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--ops-border)] text-xs text-slate-500">
                  <th className="px-2 py-2 font-medium">创建时间</th>
                  <th className="px-2 py-2 font-medium">用户</th>
                  <th className="px-2 py-2 font-medium">身份</th>
                  <th className="px-2 py-2 font-medium">档位</th>
                  <th className="px-2 py-2 font-medium">周期</th>
                  <th className="px-2 py-2 font-medium">金额</th>
                  <th className="px-2 py-2 font-medium">支付方式</th>
                  <th className="px-2 py-2 font-medium">状态</th>
                  <th className="px-2 py-2 font-medium">支付时间</th>
                  <th className="px-2 py-2 font-medium">商户单号</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--ops-border)]/60 text-slate-200">
                    <td className="px-2 py-2.5 whitespace-nowrap text-xs text-slate-400">
                      {fmtTime(row.createdAt)}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="font-medium">{row.displayName || '—'}</div>
                      <div className="text-xs text-slate-500">{row.lingqiId || row.accountId}</div>
                    </td>
                    <td className="px-2 py-2.5">{mpMembershipRoleLabel(row.role)}</td>
                    <td className="px-2 py-2.5">{mpMembershipPlanLabel(row.planId)}</td>
                    <td className="px-2 py-2.5">{row.billing === 'yearly' ? '年付' : '月付'}</td>
                    <td className="px-2 py-2.5 font-semibold text-emerald-300">¥{yuan(row.amountCents)}</td>
                    <td className="px-2 py-2.5 text-xs">{mpMembershipPayModeLabel(row.payMode)}</td>
                    <td className="px-2 py-2.5">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs', statusClass(row.status))}>
                        {mpMembershipStatusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-xs text-slate-400">
                      {row.paidAt ? fmtTime(row.paidAt) : '—'}
                    </td>
                    <td className="px-2 py-2.5 font-mono text-xs text-slate-500">
                      {row.outTradeNo || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          共 {filteredRows.length} 条（全库 {rows.length} 条）
          {summary.rejectedCount > 0 ? ` · 已拒绝 ${summary.rejectedCount} 笔` : ''}
        </p>
      </div>
    </div>
  )
}
