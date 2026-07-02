/**
 * 我的订单 · 积分消耗与套餐配额用量明细（先扣套餐额度，用尽后扣积分）。
 */
import type { MpAccountRow } from './mpAccountAuth.js'
import { buildMpAiPointsBalanceSummary, type MpAiPointsBalanceSummary } from './mpAiPointsSummary.js'
import {
  MP_PERMISSION_DEFS,
  type MpLibraryRole,
  type MpPermissionDef,
} from './mpMembershipCatalog.js'
import {
  buildMembershipAccessRecord,
  resolvePermissionEffectiveMap,
} from './mpMembershipQuota.js'
import { resolveAccountLibraryRole } from './mpAiPointsSpendCore.js'
import type { RegistryMpAiPointsSpendEntry, RegistrySnapshot } from './opsRegistryTypes.js'
import { findRegistryMemberForAccount, findRegistryPrForAccount } from './mpRegistryProfileGet.js'
import { currentGiftMonthKey } from './mpAiPointsBuckets.js'

export type MpUsagePointsLedgerRow = RegistryMpAiPointsSpendEntry & {
  kindLabel: string
}

export type MpUsageQuotaRow = {
  key: string
  label: string
  group: string
  unit: 'minutes' | 'times'
  enabled: boolean
  unlimited?: boolean
  quotaLimit?: number
  quotaUsed: number
  quotaRemaining?: number
  displayLimit: string
  displayUsed: string
  displayRemaining: string
}

export type MpMyUsageDetails = {
  deductOrderNote: string
  quotaMonth: string
  pointsSummary: MpAiPointsBalanceSummary
  pointsLedger: MpUsagePointsLedgerRow[]
  quotaRows: MpUsageQuotaRow[]
}

const POINTS_KIND_LABELS: Record<string, string> = {
  video: '短视频 AI',
  article: '文稿 AI',
  brief: 'Brief 生成',
}

function accountIdOf(account: MpAccountRow): string {
  return String(account.id || '').trim()
}

function quotaUnitOf(def: MpPermissionDef): 'minutes' | 'times' {
  return def.quotaUnit === 'minutes' ? 'minutes' : 'times'
}

function formatQuotaNumber(n: number, unit: 'minutes' | 'times'): string {
  if (unit === 'minutes') {
    const rounded = Math.round(n * 10) / 10
    return `${rounded % 1 === 0 ? Math.round(rounded) : rounded} 分钟`
  }
  return `${Math.max(0, Math.floor(n))} 次`
}

function formatQuotaLimit(limit: number | undefined, unlimited: boolean | undefined, unit: 'minutes' | 'times'): string {
  if (unlimited) return '不限'
  if (limit == null || limit <= 0) return '—'
  return formatQuotaNumber(limit, unit)
}

function resolveUsageEntity(data: RegistrySnapshot, account: MpAccountRow, role: MpLibraryRole) {
  if (role === 'pr') return findRegistryPrForAccount(data, account)
  return findRegistryMemberForAccount(data, account)
}

function listAccountPointsLedger(data: RegistrySnapshot, accountId: string): MpUsagePointsLedgerRow[] {
  const id = String(accountId || '').trim()
  if (!id) return []
  return (data.mpAiPointsSpendLedger ?? [])
    .filter((row) => String(row.accountId || '').trim() === id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 200)
    .map((row) => ({
      ...row,
      kindLabel: POINTS_KIND_LABELS[String(row.kind || '')] || String(row.kind || '积分'),
    }))
}

function buildQuotaRows(
  role: MpLibraryRole,
  effective: ReturnType<typeof resolvePermissionEffectiveMap>,
): MpUsageQuotaRow[] {
  const defs = MP_PERMISSION_DEFS[role] ?? []
  const rows: MpUsageQuotaRow[] = []
  for (const def of defs) {
    if (def.kind !== 'quota') continue
    const eff = effective[def.key]
    if (!eff?.enabled) continue
    const unit = quotaUnitOf(def)
    const used = Math.max(0, Number(eff.quotaUsed) || 0)
    const unlimited = Boolean(eff.unlimited)
    const limit = eff.quotaLimit
    const remaining = unlimited ? undefined : eff.quotaRemaining
    rows.push({
      key: def.key,
      label: def.label,
      group: def.group,
      unit,
      enabled: true,
      unlimited: unlimited || undefined,
      quotaLimit: unlimited ? undefined : limit,
      quotaUsed: used,
      quotaRemaining: remaining,
      displayLimit: formatQuotaLimit(limit, unlimited, unit),
      displayUsed: formatQuotaNumber(used, unit),
      displayRemaining: unlimited ? '不限' : formatQuotaNumber(remaining ?? 0, unit),
    })
  }
  return rows
}

export function buildMyUsageDetailsFromSnapshot(
  data: RegistrySnapshot,
  account: MpAccountRow,
): MpMyUsageDetails {
  const role = resolveAccountLibraryRole(data, account)
  const subject = resolveUsageEntity(data, account, role)
  const accessRecord = buildMembershipAccessRecord(role, subject)
  const usageEntity = subject
  const effective = resolvePermissionEffectiveMap(role, accessRecord, data, usageEntity)
  const quotaMonth = currentGiftMonthKey()

  return {
    deductOrderNote: '先消耗套餐额度（次数/分钟），套餐额度用尽后再从积分余额扣减。',
    quotaMonth,
    pointsSummary: buildMpAiPointsBalanceSummary(data, account),
    pointsLedger: listAccountPointsLedger(data, accountIdOf(account)),
    quotaRows: buildQuotaRows(role, effective),
  }
}
