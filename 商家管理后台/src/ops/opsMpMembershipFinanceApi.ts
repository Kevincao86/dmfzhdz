import {
  MP_LIBRARY_ROLE_LABEL,
  MP_MEMBERSHIP_TIER_OPTIONS,
  type MpLibraryRole,
  type MpMembershipTier,
} from '../meooRegistryShared/mpMembershipCatalog'
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
