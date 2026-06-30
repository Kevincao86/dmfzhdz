import { Filter } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../cn'
import {
  confirmOpsPaymentOrder,
  deleteOpsPaymentOrder,
  fetchOpsPaymentOrders,
  verifyOpsPaymentOrder,
  type OpsPaymentOrderRow,
} from '../opsPaymentOrdersApi'
import { useOpsModuleEdit } from '../useOpsModuleEdit'

function yuan(cents: number): string {
  return (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function kindLabel(k: OpsPaymentOrderRow['order_kind']): string {
  if (k === 'subscription') return '订阅'
  if (k === 'recharge') return '充值'
  return '退款'
}

function statusLabel(s: OpsPaymentOrderRow['status']): string {
  if (s === 'pending') return '待核对'
  if (s === 'amount_verified') return '已核对'
  if (s === 'confirmed') return '已确认'
  return '已取消'
}

function statusClass(s: OpsPaymentOrderRow['status']): string {
  if (s === 'pending') return 'bg-amber-500/15 text-amber-300'
  if (s === 'amount_verified') return 'bg-sky-500/15 text-sky-300'
  if (s === 'confirmed') return 'bg-emerald-500/15 text-emerald-300'
  return 'bg-slate-600 text-slate-300'
}

/** 订单类型列文字颜色：退款红、充值绿、订阅橙 */
function kindTextClass(k: OpsPaymentOrderRow['order_kind']): string {
  if (k === 'refund') return 'font-semibold text-red-400'
  if (k === 'recharge') return 'font-semibold text-emerald-400'
  if (k === 'subscription') return 'font-semibold text-orange-400'
  return 'text-slate-200'
}

function buildConfirmTip(o: OpsPaymentOrderRow): string {
  const verified =
    typeof o.verified_amount_cents === 'number' && Number.isFinite(o.verified_amount_cents)
      ? o.verified_amount_cents
      : null
  return o.order_kind === 'refund'
    ? `确认将退款 ¥${yuan(verified ?? o.amount_cents)} 计入商户钱包扣减？\n（运营已核对金额，确认后将从余额扣除。）`
    : `确认订单「${kindLabel(o.order_kind)}」¥${yuan(verified ?? o.amount_cents)} 已到账？\n确认后将延长订阅服务或充值入账。`
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayYmd(): string {
  return ymdLocal(new Date())
}

function daysAgoYmd(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return ymdLocal(d)
}

function createdAtInRange(iso: string, rangeStart: string, rangeEnd: string): boolean {
  let a = rangeStart
  let b = rangeEnd
  if (a && b && a > b) [a, b] = [b, a]
  if (!a && !b) return true
  const t = new Date(iso).getTime()
  if (a) {
    const [y, m, day] = a.split('-').map(Number)
    if (t < new Date(y, m - 1, day, 0, 0, 0, 0).getTime()) return false
  }
  if (b) {
    const [y, m, day] = b.split('-').map(Number)
    if (t > new Date(y, m - 1, day, 23, 59, 59, 999).getTime()) return false
  }
  return true
}

type KindFilter = 'all' | OpsPaymentOrderRow['order_kind']
type StatusFilter = 'all' | OpsPaymentOrderRow['status']
/** 列表行「操作」列可用动作 */
type ActionFilter = 'all' | 'verify' | 'confirm' | 'none'

function rowMatchesActionFilter(o: OpsPaymentOrderRow, f: ActionFilter): boolean {
  if (f === 'all') return true
  if (f === 'verify') return o.status === 'pending'
  if (f === 'confirm') return o.status === 'amount_verified'
  return o.status === 'confirmed' || o.status === 'cancelled'
}

function canDeletePaymentOrder(o: OpsPaymentOrderRow): boolean {
  return o.status === 'pending' || o.status === 'amount_verified' || o.status === 'cancelled'
}

export default function OpsPaymentOrdersPage() {
  const { canEdit } = useOpsModuleEdit()
  const [rows, setRows] = useState<OpsPaymentOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all')
  const [confirmOrder, setConfirmOrder] = useState<OpsPaymentOrderRow | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    const r = await fetchOpsPaymentOrders()
    if (!r.ok) {
      setErr(r.hint ?? r.error)
      setRows([])
      setLoading(false)
      return
    }
    setRows(r.rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 8000)
    return () => window.clearInterval(t)
  }, [load])

  const filteredRows = useMemo(() => {
    return rows.filter((o) => {
      if (!createdAtInRange(o.created_at, rangeStart, rangeEnd)) return false
      if (kindFilter !== 'all' && o.order_kind !== kindFilter) return false
      if (statusFilter !== 'all' && o.status !== statusFilter) return false
      if (!rowMatchesActionFilter(o, actionFilter)) return false
      return true
    })
  }, [rows, rangeStart, rangeEnd, kindFilter, statusFilter, actionFilter])

  const filtersActive =
    Boolean(rangeStart || rangeEnd) ||
    kindFilter !== 'all' ||
    statusFilter !== 'all' ||
    actionFilter !== 'all'

  const resetFilters = () => {
    setRangeStart('')
    setRangeEnd('')
    setKindFilter('all')
    setStatusFilter('all')
    setActionFilter('all')
  }

  const onVerify = async (o: OpsPaymentOrderRow) => {
    const raw = window.prompt(`核对到账金额（元）\n订单 ${o.id.slice(0, 8)}… 申报 ¥${yuan(o.amount_cents)}`, yuan(o.amount_cents))
    if (raw === null) return
    const n = Number(String(raw).replace(/,/g, '').trim())
    if (!Number.isFinite(n) || n <= 0) {
      window.alert('请输入有效金额')
      return
    }
    const cents = Math.round(n * 100)
    setBusyId(o.id)
    const vr = await verifyOpsPaymentOrder({ id: o.id, verified_amount_cents: cents })
    setBusyId(null)
    if (!vr.ok) {
      window.alert(vr.error ?? '核对失败')
      return
    }
    void load()
  }

  const onDelete = async (o: OpsPaymentOrderRow) => {
    if (!canDeletePaymentOrder(o)) return
    const tip = `确定删除该订单？\n${kindLabel(o.order_kind)} · ¥${yuan(o.amount_cents)} · ${o.id.slice(0, 8)}…\n仅未入账（待核对 / 已核对待确认 / 已取消）可删。`
    if (!window.confirm(tip)) return
    setBusyId(o.id)
    const dr = await deleteOpsPaymentOrder({ id: o.id })
    setBusyId(null)
    if (!dr.ok) {
      window.alert(dr.hint ?? dr.error ?? '删除失败')
      return
    }
    void load()
  }

  const executeConfirm = async () => {
    const o = confirmOrder
    if (!o) return
    setBusyId(o.id)
    try {
      const cr = await confirmOpsPaymentOrder({ id: o.id })
      if (!cr.ok) {
        window.alert(cr.error ?? '确认失败')
        return
      }
      void load()
    } finally {
      setBusyId(null)
      setConfirmOrder(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">订单管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            充值 / 订阅在商家点击「我已完成支付」后入列；<strong className="text-slate-400">退款</strong>
            由商家在钱包发起。请先<strong className="text-slate-400">核对金额</strong>
            ，再<strong className="text-slate-400">确认</strong>
            （入账、延长服务或从钱包扣减）。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          刷新
        </button>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{err}</div>
      ) : null}

      {!err ? (
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 shrink-0 text-indigo-400" />
              <span className="text-sm font-medium text-slate-200">筛选</span>
              <span className="text-xs text-slate-500">
                共 {rows.length} 条
                {filtersActive ? `，当前显示 ${filteredRows.length} 条` : null}
              </span>
            </div>
            {filtersActive ? (
              <button type="button" onClick={resetFilters} className="text-xs text-indigo-400 hover:underline">
                重置筛选
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[140px] flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">开始日期</span>
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              />
            </label>
            <label className="flex min-w-[140px] flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">结束日期</span>
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              />
            </label>
            <div className="flex flex-wrap gap-2 pb-0.5">
              <span className="sr-only">时间段快捷选项</span>
              <button
                type="button"
                onClick={() => {
                  const t = todayYmd()
                  setRangeStart(t)
                  setRangeEnd(t)
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                今天
              </button>
              <button
                type="button"
                onClick={() => {
                  setRangeEnd(todayYmd())
                  setRangeStart(daysAgoYmd(6))
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                近 7 天
              </button>
              <button
                type="button"
                onClick={() => {
                  setRangeEnd(todayYmd())
                  setRangeStart(daysAgoYmd(29))
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                近 30 天
              </button>
              <button
                type="button"
                onClick={() => {
                  setRangeStart('')
                  setRangeEnd('')
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                不限时间
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[8rem] flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">类型</span>
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as KindFilter)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                <option value="all">全部</option>
                <option value="subscription">订阅</option>
                <option value="recharge">充值</option>
                <option value="refund">退款</option>
              </select>
            </label>
            <label className="flex min-w-[8rem] flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">状态</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                <option value="all">全部</option>
                <option value="pending">待核对</option>
                <option value="amount_verified">已核对</option>
                <option value="confirmed">已确认</option>
                <option value="cancelled">已取消</option>
              </select>
            </label>
            <label className="flex min-w-[10rem] flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">操作</span>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value as ActionFilter)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                <option value="all">全部</option>
                <option value="verify">可核对金额</option>
                <option value="confirm">可确认</option>
                <option value="none">无可用操作</option>
              </select>
            </label>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-950/80 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="whitespace-nowrap px-4 py-3">时间</th>
              <th className="whitespace-nowrap px-4 py-3">类型</th>
              <th className="whitespace-nowrap px-4 py-3">商户</th>
              <th className="whitespace-nowrap px-4 py-3">渠道</th>
              <th className="whitespace-nowrap px-4 py-3">申报金额</th>
              <th className="whitespace-nowrap px-4 py-3">核对金额</th>
              <th className="whitespace-nowrap px-4 py-3">状态</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  加载中…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  暂无订单。商家端完成支付申报后将出现在此列表。
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  当前筛选条件下暂无订单。可点击「重置筛选」或调整条件。
                </td>
              </tr>
            ) : (
              filteredRows.map((o) => (
                <tr key={o.id} className="hover:bg-slate-800/40">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                    {new Date(o.created_at).toLocaleString('zh-CN', { hour12: false })}
                  </td>
                  <td className={cn('whitespace-nowrap px-4 py-3', kindTextClass(o.order_kind))}>
                    {kindLabel(o.order_kind)}
                  </td>
                  <td className="max-w-[14rem] px-4 py-3">
                    <div className="truncate font-medium text-white">{o.merchant_name ?? '—'}</div>
                    <Link
                      to={`/customers/${o.tenant_id}`}
                      className="text-xs text-indigo-400 hover:underline"
                    >
                      客户详情
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                    {o.order_kind === 'refund'
                      ? '—'
                      : o.pay_channel === 'wechat'
                        ? '微信'
                        : o.pay_channel === 'alipay'
                          ? '支付宝'
                          : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">¥{yuan(o.amount_cents)}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-300">
                    {typeof o.verified_amount_cents === 'number' ? `¥${yuan(o.verified_amount_cents)}` : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', statusClass(o.status))}>
                      {statusLabel(o.status)}
                    </span>
                    {o.status === 'confirmed' && o.order_kind === 'subscription' && typeof o.extend_days_applied === 'number' ? (
                      <span className="ml-2 text-xs text-slate-500">+{o.extend_days_applied} 天</span>
                    ) : null}
                    {o.status === 'confirmed' && o.order_kind === 'recharge' && typeof o.wallet_credit_cents_applied === 'number' ? (
                      <span className="ml-2 text-xs text-slate-500">+¥{yuan(o.wallet_credit_cents_applied)}</span>
                    ) : null}
                    {o.status === 'confirmed' && o.order_kind === 'refund' && typeof o.verified_amount_cents === 'number' ? (
                      <span className="ml-2 text-xs text-slate-500">−¥{yuan(o.verified_amount_cents)}</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {canEdit ? (
                    <div className="flex justify-end gap-2">
                      {o.status === 'pending' ? (
                        <button
                          type="button"
                          disabled={busyId === o.id}
                          onClick={() => void onVerify(o)}
                          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                        >
                          核对金额
                        </button>
                      ) : null}
                      {o.status === 'amount_verified' ? (
                        <button
                          type="button"
                          disabled={busyId === o.id}
                          onClick={() => setConfirmOrder(o)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          确认
                        </button>
                      ) : null}
                      {canDeletePaymentOrder(o) ? (
                        <button
                          type="button"
                          disabled={busyId === o.id}
                          onClick={() => void onDelete(o)}
                          className="rounded-lg border border-rose-500/60 bg-transparent px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-950/40 disabled:opacity-50"
                        >
                          删除
                        </button>
                      ) : null}
                    </div>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {confirmOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmOrder(null)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-order-title"
            className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-order-title" className="text-lg font-semibold text-white">
              确认入账
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
              {buildConfirmTip(confirmOrder)}
            </p>
            <p className="mt-2 text-xs text-slate-500">请核对无误后再确认，此操作将影响商户钱包或服务到期时间。</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={busyId === confirmOrder.id}
                onClick={() => setConfirmOrder(null)}
                className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={busyId === confirmOrder.id}
                onClick={() => void executeConfirm()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {busyId === confirmOrder.id ? '处理中…' : '确定'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
