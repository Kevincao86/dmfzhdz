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
import { resolvePointsLibraryRole } from './mpAiPointsSpendCore.js'
import type { RegistryMpAiPointsSpendEntry, RegistrySnapshot } from './opsRegistryTypes.js'
import { findRegistryMemberForAccount, findRegistryPrForAccount } from './mpRegistryProfileGet.js'
import { currentGiftMonthKey } from './mpAiPointsBuckets.js'

export type MpUsagePointsLedgerRow = RegistryMpAiPointsSpendEntry & {
  kindLabel: string
  chargeSummary: string
}

export type MpUsageLedgerRow = MpUsagePointsLedgerRow

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
  /** 仅含实际消耗套餐额度（次数/分钟）的流水，纯积分扣减（如 Brief）不在此列 */
  usageLedger: MpUsageLedgerRow[]
  quotaRows: MpUsageQuotaRow[]
}

import {
  MP_POINTS_USAGE_KIND_LABELS,
  type MpPointsUsageKind,
} from './mpPointsEconomics.js'

function formatLedgerNote(row: RegistryMpAiPointsSpendEntry): string | undefined {
  const note = String(row.note || '').trim()
  if (!note) return undefined
  if (note.startsWith('brief:')) {
    const [, orderId, platform] = note.split(':')
    const parts = ['1次']
    if (orderId) parts.unshift(`订单 ${orderId}`)
    if (platform) parts.push(platform)
    return parts.join(' · ')
  }
  if (note.startsWith('article:')) {
    const orderId = note.slice('article:'.length).trim()
    return orderId ? `1次 · 订单 ${orderId}` : '1次'
  }
  if (note.startsWith('video:')) {
    const orderId = note.slice('video:'.length).trim()
    return orderId ? `订单 ${orderId}` : undefined
  }
  if (note.startsWith('shortvideo:')) {
    const tail = note.slice('shortvideo:'.length).trim()
    return tail ? `成片 ${tail}` : '短视频 AI 处理'
  }
  if (note.startsWith('cloud_edit:')) {
    const tail = note.slice('cloud_edit:'.length).trim()
    return tail ? `云剪 ${tail}` : '灵祺 AI 云剪'
  }
  if (note.startsWith('cloud_edit_smart:')) {
    const tail = note.slice('cloud_edit_smart:'.length).trim()
    return tail ? `智能成片 ${tail}` : '智能一键成片'
  }
  if (note.startsWith('mix_material_analyze:')) {
    const tail = note.slice('mix_material_analyze:'.length).trim()
    return tail ? `1次 · ${tail}` : '1次'
  }
  if (note.startsWith('digital_human:')) {
    const tail = note.slice('digital_human:'.length).trim()
    return tail ? `口播 ${tail}` : '数字人口播'
  }
  return note
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

function formatChargeSummary(row: RegistryMpAiPointsSpendEntry): string {
  const pts = Math.max(0, Math.floor(Number(row.points) || 0))
  const quotaUnits = Math.max(0, Number(row.quotaUnitsUsed) || 0)
  const parts: string[] = []
  if (quotaUnits > 0) {
    const unit =
      row.kind === 'video'
        ? 'minutes'
        : row.kind === 'shortvideo' ||
            row.kind === 'cloud_edit' ||
            row.kind === 'cloud_edit_smart' ||
            row.kind === 'digital_human'
          ? 'times'
          : 'times'
    parts.push(`套餐额度 ${formatQuotaNumber(quotaUnits, unit)}`)
  }
  if (pts > 0) parts.push(`${pts.toLocaleString('zh-CN')} 积分`)
  if (parts.length === 0) return '—'
  return `消耗 ${parts.join(' + ')}`
}

function mapLedgerRow(row: RegistryMpAiPointsSpendEntry): MpUsagePointsLedgerRow {
  return {
    ...row,
    kindLabel: MP_POINTS_USAGE_KIND_LABELS[String(row.kind || '') as MpPointsUsageKind] || String(row.kind || '积分'),
    note: formatLedgerNote(row) ?? row.note,
    chargeSummary: formatChargeSummary(row),
  }
}

function listAccountUsageLedger(data: RegistrySnapshot, accountId: string): MpUsageLedgerRow[] {
  const id = String(accountId || '').trim()
  if (!id) return []
  return (data.mpAiPointsSpendLedger ?? [])
    .filter((row) => String(row.accountId || '').trim() === id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 200)
    .map(mapLedgerRow)
}

function listAccountQuotaUsageLedger(data: RegistrySnapshot, accountId: string): MpUsageLedgerRow[] {
  return listAccountUsageLedger(data, accountId).filter(
    (row) => Math.max(0, Number(row.quotaUnitsUsed) || 0) > 0,
  )
}

function listAccountPointsLedger(data: RegistrySnapshot, accountId: string): MpUsagePointsLedgerRow[] {
  return listAccountUsageLedger(data, accountId).filter((row) => Math.max(0, Number(row.points) || 0) > 0)
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
  opts?: { roleHint?: MpLibraryRole | null },
): MpMyUsageDetails {
  const role = resolvePointsLibraryRole(data, account, opts)
  const subject = resolveUsageEntity(data, account, role)
  const accessRecord = buildMembershipAccessRecord(role, subject)
  const usageEntity = subject
  const effective = resolvePermissionEffectiveMap(role, accessRecord, data, usageEntity)
  const quotaMonth = currentGiftMonthKey()

  return {
    deductOrderNote:
      'AI 视频/文稿检核、短视频/云剪/数字人、Brief 等均按积分扣减（套餐赠送积分桶优先，不足再扣充值积分）；余额不足请充值或升级套餐。',
    quotaMonth,
    pointsSummary: buildMpAiPointsBalanceSummary(data, account, opts),
    pointsLedger: listAccountPointsLedger(data, accountIdOf(account)),
    usageLedger: listAccountQuotaUsageLedger(data, accountIdOf(account)),
    quotaRows: buildQuotaRows(role, effective),
  }
}
