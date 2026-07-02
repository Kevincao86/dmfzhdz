import {
  MP_LIBRARY_ROLE_LABEL,
  MP_MEMBERSHIP_TIER_OPTIONS,
  type MpLibraryRole,
  type MpMembershipTier,
} from '../meooRegistryShared/mpMembershipCatalog'
import * as XLSX from 'xlsx'
import { fetchRegistry, type RegistryMpMembershipCheckoutRequest } from './opsRegistryApi'

export type MpMembershipFinanceRow = RegistryMpMembershipCheckoutRequest

export type MpMembershipFinanceSummary = {
  totalConfirmedCents: number
  totalPendingCents: number
  confirmedCount: number
  pendingCount: number
  rejectedCount: number
  todayConfirmedCents: number
  monthConfirmedCents: number
}

export type MpMembershipDailyRevenue = {
  date: string
  cents: number
  count: number
}

export type MpMembershipBreakdownSlice = {
  key: string
  label: string
  cents: number
  count: number
}

function planLabel(planId: string): string {
  const hit = MP_MEMBERSHIP_TIER_OPTIONS.find((o) => o.value === (planId as MpMembershipTier))
  return hit?.label ?? planId
}

export function mpMembershipRoleLabel(role: MpLibraryRole): string {
  return MP_LIBRARY_ROLE_LABEL[role] ?? role
}

export function mpMembershipPlanLabel(planId: string): string {
  return planLabel(planId)
}

export function mpMembershipStatusLabel(status: MpMembershipFinanceRow['status']): string {
  if (status === 'confirmed') return '已开通'
  if (status === 'rejected') return '已拒绝'
  return '待支付'
}

export function mpMembershipPayModeLabel(payMode?: MpMembershipFinanceRow['payMode']): string {
  if (payMode === 'wechat_native') return '微信 Native'
  if (payMode === 'wechat_jsapi') return '微信 JSAPI'
  if (payMode === 'alipay_precreate') return '支付宝扫码'
  if (payMode === 'douyin_request_order') return '抖音 JSAPI'
  if (payMode === 'douyin_native') return '抖音 Native'
  return '手动申报'
}

function rowTimeIso(row: MpMembershipFinanceRow): string {
  return row.paidAt || row.createdAt
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function inRange(iso: string, rangeStart: string, rangeEnd: string): boolean {
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

export function computeMpMembershipFinanceSummary(
  rows: MpMembershipFinanceRow[],
  rangeStart = '',
  rangeEnd = '',
): MpMembershipFinanceSummary {
  const today = ymdLocal(new Date())
  const monthPrefix = today.slice(0, 7)
  let totalConfirmedCents = 0
  let totalPendingCents = 0
  let confirmedCount = 0
  let pendingCount = 0
  let rejectedCount = 0
  let todayConfirmedCents = 0
  let monthConfirmedCents = 0

  for (const row of rows) {
    const t = rowTimeIso(row)
    if (!inRange(t, rangeStart, rangeEnd)) continue
    if (row.status === 'confirmed') {
      totalConfirmedCents += row.amountCents
      confirmedCount += 1
      const paidYmd = ymdLocal(new Date(t))
      if (paidYmd === today) todayConfirmedCents += row.amountCents
      if (paidYmd.startsWith(monthPrefix)) monthConfirmedCents += row.amountCents
    } else if (row.status === 'pending') {
      totalPendingCents += row.amountCents
      pendingCount += 1
    } else if (row.status === 'rejected') {
      rejectedCount += 1
    }
  }

  return {
    totalConfirmedCents,
    totalPendingCents,
    confirmedCount,
    pendingCount,
    rejectedCount,
    todayConfirmedCents,
    monthConfirmedCents,
  }
}

export async function fetchMpMembershipFinanceRows(): Promise<MpMembershipFinanceRow[]> {
  const reg = await fetchRegistry()
  const list = reg.mpMembershipCheckoutRequests ?? []
  return [...list].sort((a, b) => {
    const ta = new Date(rowTimeIso(a)).getTime()
    const tb = new Date(rowTimeIso(b)).getTime()
    return tb - ta
  })
}

export function filterMpMembershipFinanceRows(
  rows: MpMembershipFinanceRow[],
  opts: {
    rangeStart?: string
    rangeEnd?: string
    status?: 'all' | MpMembershipFinanceRow['status']
    role?: 'all' | MpLibraryRole
    planId?: 'all' | string
  },
): MpMembershipFinanceRow[] {
  const { rangeStart = '', rangeEnd = '', status = 'all', role = 'all', planId = 'all' } = opts
  return rows.filter((row) => {
    if (!inRange(rowTimeIso(row), rangeStart, rangeEnd)) return false
    if (status !== 'all' && row.status !== status) return false
    if (role !== 'all' && row.role !== role) return false
    if (planId !== 'all' && row.planId !== planId) return false
    return true
  })
}

export function yuan(cents: number): string {
  return (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function confirmedRowsInRange(
  rows: MpMembershipFinanceRow[],
  rangeStart = '',
  rangeEnd = '',
): MpMembershipFinanceRow[] {
  return rows.filter(
    (row) => row.status === 'confirmed' && inRange(rowTimeIso(row), rangeStart, rangeEnd),
  )
}

export function computeDailyConfirmedRevenue(
  rows: MpMembershipFinanceRow[],
  rangeStart = '',
  rangeEnd = '',
): MpMembershipDailyRevenue[] {
  const map = new Map<string, { cents: number; count: number }>()
  for (const row of confirmedRowsInRange(rows, rangeStart, rangeEnd)) {
    const date = ymdLocal(new Date(rowTimeIso(row)))
    const prev = map.get(date) ?? { cents: 0, count: 0 }
    map.set(date, { cents: prev.cents + row.amountCents, count: prev.count + 1 })
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, cents: v.cents, count: v.count }))
}

export function computeBreakdownByPlan(
  rows: MpMembershipFinanceRow[],
  rangeStart = '',
  rangeEnd = '',
): MpMembershipBreakdownSlice[] {
  const map = new Map<string, { cents: number; count: number }>()
  for (const row of confirmedRowsInRange(rows, rangeStart, rangeEnd)) {
    const key = row.planId
    const prev = map.get(key) ?? { cents: 0, count: 0 }
    map.set(key, { cents: prev.cents + row.amountCents, count: prev.count + 1 })
  }
  return [...map.entries()]
    .sort((a, b) => b[1].cents - a[1].cents)
    .map(([key, v]) => ({ key, label: mpMembershipPlanLabel(key), cents: v.cents, count: v.count }))
}

export function computeBreakdownByRole(
  rows: MpMembershipFinanceRow[],
  rangeStart = '',
  rangeEnd = '',
): MpMembershipBreakdownSlice[] {
  const map = new Map<string, { cents: number; count: number }>()
  for (const row of confirmedRowsInRange(rows, rangeStart, rangeEnd)) {
    const key = row.role
    const prev = map.get(key) ?? { cents: 0, count: 0 }
    map.set(key, { cents: prev.cents + row.amountCents, count: prev.count + 1 })
  }
  return [...map.entries()]
    .sort((a, b) => b[1].cents - a[1].cents)
    .map(([key, v]) => ({
      key,
      label: mpMembershipRoleLabel(key as MpLibraryRole),
      cents: v.cents,
      count: v.count,
    }))
}

function financeRowToExportCells(row: MpMembershipFinanceRow): Record<string, string | number> {
  return {
    创建时间: row.createdAt,
    支付时间: row.paidAt || '',
    用户: row.displayName || '',
    灵祺ID: row.lingqiId || '',
    账号ID: row.accountId,
    身份: mpMembershipRoleLabel(row.role),
    档位: mpMembershipPlanLabel(row.planId),
    周期: row.billing === 'yearly' ? '年付' : '月付',
    金额元: Number(yuan(row.amountCents)),
    支付方式: mpMembershipPayModeLabel(row.payMode),
    状态: mpMembershipStatusLabel(row.status),
    商户单号: row.outTradeNo || '',
    微信流水: row.wechatTransactionId || '',
  }
}

export function downloadMpMembershipFinanceCsv(rows: MpMembershipFinanceRow[], filenamePrefix = '星选会员财务'): void {
  const header = Object.keys(financeRowToExportCells(rows[0] ?? ({} as MpMembershipFinanceRow)))
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

export function downloadMpMembershipFinanceXlsx(rows: MpMembershipFinanceRow[], filenamePrefix = '星选会员财务'): void {
  const sample = financeRowToExportCells({
    id: '',
    role: 'talent',
    accountId: '',
    planId: 'pro',
    billing: 'monthly',
    amountCents: 0,
    channel: 'wechat',
    status: 'pending',
    createdAt: '',
  })
  const sheetRows = rows.length ? rows.map((row) => financeRowToExportCells(row)) : [sample]
  const ws = XLSX.utils.json_to_sheet(sheetRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '会员支付')
  XLSX.writeFile(wb, `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
