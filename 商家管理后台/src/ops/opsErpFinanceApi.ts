import * as XLSX from 'xlsx'
import { fetchOpsPaymentOrders, type OpsPaymentOrderRow } from './opsPaymentOrdersApi'
import {
  membershipPlanFromVerifiedCents,
  subscriptionDaysFromVerifiedCents,
  type OpsMembershipPlan,
} from './paymentTierLogic'

export type ErpFinanceKind = OpsPaymentOrderRow['order_kind']
export type ErpFinanceStatus = OpsPaymentOrderRow['status']

export type ErpFinanceSummary = {
  totalConfirmedCents: number
  totalPendingCents: number
  confirmedCount: number
  pendingCount: number
  cancelledCount: number
  openCount: number
  rechargeCount: number
  openTenantCount: number
  todayConfirmedCents: number
  monthConfirmedCents: number
  refundConfirmedCents: number
}

export type ErpFinanceDailyRevenue = {
  date: string
  cents: number
  count: number
}

export type ErpFinanceBreakdownSlice = {
  key: string
  label: string
  cents: number
  count: number
}

const PLAN_LABEL: Record<OpsMembershipPlan, string> = {
  free: '免费版',
  member: '会员版',
  member_store: '进阶版',
  member_plus: '会员 Plus',
}

export function yuan(cents: number): string {
  return (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function erpFinanceKindLabel(kind: ErpFinanceKind): string {
  if (kind === 'subscription') return '开通'
  if (kind === 'recharge') return '充值'
  return '退款'
}

export function erpFinanceStatusLabel(status: ErpFinanceStatus): string {
  if (status === 'confirmed') return '已到账'
  if (status === 'amount_verified') return '已核对'
  if (status === 'cancelled') return '已取消'
  return '待核对'
}

export function erpFinancePayChannelLabel(channel: string | null): string {
  if (channel === 'wechat') return '微信'
  if (channel === 'alipay') return '支付宝'
  if (channel === 'douyin') return '抖音'
  return channel?.trim() || '—'
}

export function erpFinanceAmountCents(row: OpsPaymentOrderRow): number {
  if (row.status === 'confirmed' && typeof row.verified_amount_cents === 'number') {
    return row.verified_amount_cents
  }
  return row.amount_cents
}

export function erpFinancePlanKey(row: OpsPaymentOrderRow): string {
  if (row.order_kind === 'recharge') return 'recharge'
  if (row.order_kind === 'refund') return 'refund'
  const plan = membershipPlanFromVerifiedCents(erpFinanceAmountCents(row))
  return plan || 'subscription'
}

export function erpFinancePlanLabel(row: OpsPaymentOrderRow): string {
  const key = erpFinancePlanKey(row)
  if (key === 'recharge') return '充值'
  if (key === 'refund') return '退款'
  if (key === 'subscription') return '开通'
  return PLAN_LABEL[key as OpsMembershipPlan] ?? key
}

export function erpFinancePeriodLabel(row: OpsPaymentOrderRow): string {
  if (row.order_kind !== 'subscription') return '—'
  if (typeof row.extend_days_applied === 'number' && row.extend_days_applied > 0) {
    if (row.extend_days_applied >= 80 && row.extend_days_applied <= 100) return '季付'
    if (row.extend_days_applied >= 25 && row.extend_days_applied <= 35) return '月付'
    return `${row.extend_days_applied} 天`
  }
  const days = subscriptionDaysFromVerifiedCents(erpFinanceAmountCents(row))
  if (days >= 80 && days <= 100) return '季付'
  if (days >= 25 && days <= 35) return '月付'
  return days > 0 ? `${days} 天` : '—'
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function rowTimeIso(row: OpsPaymentOrderRow): string {
  if (row.status === 'confirmed') return row.confirmed_at || row.updated_at || row.created_at
  return row.created_at
}

function inRange(iso: string, rangeStart: string, rangeEnd: string): boolean {
  let a = rangeStart
  let b = rangeEnd
  if (a && b && a > b) [a, b] = [b, a]
  if (!a && !b) return true
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return false
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

function isIncomeKind(kind: ErpFinanceKind): boolean {
  return kind === 'subscription' || kind === 'recharge'
}

export async function fetchErpFinanceRows(): Promise<OpsPaymentOrderRow[]> {
  const res = await fetchOpsPaymentOrders()
  if (!res.ok) throw new Error(res.hint ? `${res.error}：${res.hint}` : res.error)
  return [...res.rows].sort((a, b) => {
    const ta = new Date(rowTimeIso(a)).getTime()
    const tb = new Date(rowTimeIso(b)).getTime()
    return tb - ta
  })
}

export function filterErpFinanceRows(
  rows: OpsPaymentOrderRow[],
  opts: {
    rangeStart?: string
    rangeEnd?: string
    status?: 'all' | ErpFinanceStatus
    kind?: 'all' | ErpFinanceKind
    planKey?: 'all' | string
  },
): OpsPaymentOrderRow[] {
  const { rangeStart = '', rangeEnd = '', status = 'all', kind = 'all', planKey = 'all' } = opts
  return rows.filter((row) => {
    if (!inRange(rowTimeIso(row), rangeStart, rangeEnd)) return false
    if (status !== 'all' && row.status !== status) return false
    if (kind !== 'all' && row.order_kind !== kind) return false
    if (planKey !== 'all' && erpFinancePlanKey(row) !== planKey) return false
    return true
  })
}

export function computeErpFinanceSummary(
  rows: OpsPaymentOrderRow[],
  rangeStart = '',
  rangeEnd = '',
): ErpFinanceSummary {
  const today = ymdLocal(new Date())
  const monthPrefix = today.slice(0, 7)
  const openTenants = new Set<string>()
  const summary: ErpFinanceSummary = {
    totalConfirmedCents: 0,
    totalPendingCents: 0,
    confirmedCount: 0,
    pendingCount: 0,
    cancelledCount: 0,
    openCount: 0,
    rechargeCount: 0,
    openTenantCount: 0,
    todayConfirmedCents: 0,
    monthConfirmedCents: 0,
    refundConfirmedCents: 0,
  }

  for (const row of rows) {
    const t = rowTimeIso(row)
    if (!inRange(t, rangeStart, rangeEnd)) continue
    const cents = erpFinanceAmountCents(row)
    if (row.status === 'confirmed') {
      const paidYmd = ymdLocal(new Date(t))
      if (row.order_kind === 'refund') {
        summary.refundConfirmedCents += cents
        continue
      }
      if (!isIncomeKind(row.order_kind)) continue
      summary.totalConfirmedCents += cents
      summary.confirmedCount += 1
      if (row.order_kind === 'subscription') {
        summary.openCount += 1
        if (row.tenant_id) openTenants.add(row.tenant_id)
      } else if (row.order_kind === 'recharge') {
        summary.rechargeCount += 1
      }
      if (paidYmd === today) summary.todayConfirmedCents += cents
      if (paidYmd.startsWith(monthPrefix)) summary.monthConfirmedCents += cents
    } else if (row.status === 'pending' || row.status === 'amount_verified') {
      if (!isIncomeKind(row.order_kind)) continue
      summary.totalPendingCents += row.amount_cents
      summary.pendingCount += 1
    } else if (row.status === 'cancelled') {
      summary.cancelledCount += 1
    }
  }
  summary.openTenantCount = openTenants.size
  return summary
}

function confirmedIncomeRows(
  rows: OpsPaymentOrderRow[],
  rangeStart = '',
  rangeEnd = '',
): OpsPaymentOrderRow[] {
  return rows.filter(
    (row) =>
      row.status === 'confirmed' &&
      isIncomeKind(row.order_kind) &&
      inRange(rowTimeIso(row), rangeStart, rangeEnd),
  )
}

export function computeErpDailyConfirmedRevenue(
  rows: OpsPaymentOrderRow[],
  rangeStart = '',
  rangeEnd = '',
): ErpFinanceDailyRevenue[] {
  const map = new Map<string, { cents: number; count: number }>()
  for (const row of confirmedIncomeRows(rows, rangeStart, rangeEnd)) {
    const date = ymdLocal(new Date(rowTimeIso(row)))
    const prev = map.get(date) ?? { cents: 0, count: 0 }
    map.set(date, { cents: prev.cents + erpFinanceAmountCents(row), count: prev.count + 1 })
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, cents: v.cents, count: v.count }))
}

export function computeErpBreakdownByKind(
  rows: OpsPaymentOrderRow[],
  rangeStart = '',
  rangeEnd = '',
): ErpFinanceBreakdownSlice[] {
  const map = new Map<string, { cents: number; count: number }>()
  for (const row of confirmedIncomeRows(rows, rangeStart, rangeEnd)) {
    const key = row.order_kind
    const prev = map.get(key) ?? { cents: 0, count: 0 }
    map.set(key, { cents: prev.cents + erpFinanceAmountCents(row), count: prev.count + 1 })
  }
  return [...map.entries()]
    .sort((a, b) => b[1].cents - a[1].cents)
    .map(([key, v]) => ({
      key,
      label: erpFinanceKindLabel(key as ErpFinanceKind),
      cents: v.cents,
      count: v.count,
    }))
}

export function computeErpBreakdownByPlan(
  rows: OpsPaymentOrderRow[],
  rangeStart = '',
  rangeEnd = '',
): ErpFinanceBreakdownSlice[] {
  const map = new Map<string, { cents: number; count: number }>()
  for (const row of confirmedIncomeRows(rows, rangeStart, rangeEnd)) {
    const key = erpFinancePlanKey(row)
    const prev = map.get(key) ?? { cents: 0, count: 0 }
    map.set(key, { cents: prev.cents + erpFinanceAmountCents(row), count: prev.count + 1 })
  }
  return [...map.entries()]
    .sort((a, b) => b[1].cents - a[1].cents)
    .map(([key, v]) => ({
      key,
      label: key === 'recharge' ? '充值' : PLAN_LABEL[key as OpsMembershipPlan] ?? '开通',
      cents: v.cents,
      count: v.count,
    }))
}

function financeRowToExportCells(row: OpsPaymentOrderRow): Record<string, string | number> {
  return {
    创建时间: row.created_at,
    到账时间: row.confirmed_at || '',
    商家: row.merchant_name || '',
    登录名: row.tenant_login_name || '',
    租户ID: row.tenant_id,
    类型: erpFinanceKindLabel(row.order_kind),
    档位: erpFinancePlanLabel(row),
    周期: erpFinancePeriodLabel(row),
    金额元: Number(yuan(erpFinanceAmountCents(row))),
    支付渠道: erpFinancePayChannelLabel(row.pay_channel),
    状态: erpFinanceStatusLabel(row.status),
    延长天数: row.extend_days_applied ?? '',
    入账元:
      typeof row.wallet_credit_cents_applied === 'number' ? Number(yuan(row.wallet_credit_cents_applied)) : '',
    备注: row.client_note || '',
  }
}

export function downloadErpFinanceCsv(rows: OpsPaymentOrderRow[], filenamePrefix = '商家ERP财务'): void {
  const header = Object.keys(financeRowToExportCells(rows[0] ?? ({} as OpsPaymentOrderRow)))
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      header
        .map((key) => {
          const val = financeRowToExportCells(row)[key]
          const s = String(val ?? '')
          return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    ),
  ]
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadErpFinanceXlsx(rows: OpsPaymentOrderRow[], filenamePrefix = '商家ERP财务'): void {
  const sheetRows = rows.length
    ? rows.map((row) => financeRowToExportCells(row))
    : [financeRowToExportCells({} as OpsPaymentOrderRow)]
  const ws = XLSX.utils.json_to_sheet(sheetRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '商家ERP财务')
  XLSX.writeFile(wb, `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
