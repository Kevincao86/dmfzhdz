/**
 * 星选会员套餐配额：视频分钟桶按时长扣减，超出后按积分；其余按次数扣减，超出后按积分。
 */
import {
  listMembershipPlanVersions,
  resolveEffectiveMembershipTier,
  resolveEffectivePermissionCells,
  resolveMpPermissionRowsWithVersions,
  type MpLibraryRole,
  type MpMembershipAccessRecord,
  type MpPlanVersionRegistrySlice,
} from './mpMembershipCatalog.js'
import type { MpAccountRow } from './mpAccountAuth.js'
import {
  resolvePointsLibraryRole,
  resolveRegistryTargetIdForAccount,
} from './mpAiPointsSpendCore.js'
import type { MpPointsUsageKind } from './mpPointsEconomics.js'
import { isMpPointsAddonGenerationKind, mpPointsCostForUsage } from './mpPointsEconomics.js'
import type { RegistryMpPrUser, RegistryMpTalentMember, RegistrySnapshot } from './opsRegistryTypes.js'
import { findRegistryMemberForAccount, findRegistryPrForAccount } from './mpRegistryProfileGet.js'
import { currentGiftMonthKey } from './mpAiPointsBuckets.js'

type TierCell = boolean | number | string

function dash(): string {
  return '—'
}

export type MpQuotaUsageEntity = {
  mpQuotaUsageMonth?: string
  mpQuotaUsage?: Record<string, number>
}

export type MpPermissionEffectiveRow = {
  key: string
  enabled: boolean
  quotaLimit?: number
  quotaUsed?: number
  quotaRemaining?: number
  unlimited?: boolean
}

const VIDEO_QUOTA_KEY: Partial<Record<MpLibraryRole, string>> = {
  pr: 'ai_compliance_video',
  talent: 'ai_selfcheck_video',
}

const ARTICLE_QUOTA_KEY: Partial<Record<MpLibraryRole, string>> = {
  pr: 'ai_compliance_copy',
  talent: 'ai_selfcheck_copy',
}

const ADDON_VIDEO_QUOTA_KEY = 'ai_video_quota'

export function quotaKeyForUsageKind(role: MpLibraryRole, kind: MpPointsUsageKind): string | null {
  if (kind === 'video') return VIDEO_QUOTA_KEY[role] ?? VIDEO_QUOTA_KEY.talent ?? null
  if (kind === 'article') return ARTICLE_QUOTA_KEY[role] ?? ARTICLE_QUOTA_KEY.talent ?? null
  if (isMpPointsAddonGenerationKind(kind)) return ADDON_VIDEO_QUOTA_KEY
  return null
}

function readQuotaEntity(
  data: RegistrySnapshot,
  role: MpLibraryRole,
  targetId: string,
): MpQuotaUsageEntity | null {
  const id = String(targetId || '').trim()
  if (!id) return null
  if (role === 'pr') {
    return (data.mpPrUsers ?? []).find((u) => u.id === id || u.lingqiPrId === id) ?? null
  }
  const member = (data.mpTalentMembers ?? []).find((m) => m.id === id || String(m.lingqiTalentId || '').trim() === id)
  if (member) return member
  if (role === 'talent') {
    return (data.talentLibraryEntries ?? []).find((e) => e.id === id || String(e.lingqiTalentId || '').trim() === id) ?? null
  }
  return null
}

function writeQuotaEntity(
  data: RegistrySnapshot,
  role: MpLibraryRole,
  targetId: string,
  patch: MpQuotaUsageEntity,
): void {
  const id = String(targetId || '').trim()
  if (!id) return
  if (role === 'pr') {
    const users = data.mpPrUsers ?? []
    const idx = users.findIndex((u) => u.id === id || u.lingqiPrId === id)
    if (idx < 0) return
    users[idx] = { ...users[idx]!, ...patch }
    data.mpPrUsers = users
    return
  }
  const members = data.mpTalentMembers ?? []
  const midx = members.findIndex((m) => m.id === id || String(m.lingqiTalentId || '').trim() === id)
  if (midx >= 0) {
    members[midx] = { ...members[midx]!, ...patch }
    data.mpTalentMembers = members
    return
  }
  if (role === 'talent') {
    const entries = data.talentLibraryEntries ?? []
    const eidx = entries.findIndex((e) => e.id === id || String(e.lingqiTalentId || '').trim() === id)
    if (eidx < 0) return
    entries[eidx] = { ...entries[eidx]!, ...patch }
    data.talentLibraryEntries = entries
  }
}

export function ensureQuotaUsageMonth(entity: MpQuotaUsageEntity, month = currentGiftMonthKey()): MpQuotaUsageEntity {
  if (String(entity.mpQuotaUsageMonth || '') === month) return entity
  return { ...entity, mpQuotaUsageMonth: month, mpQuotaUsage: {} }
}

export function readQuotaUsed(entity: MpQuotaUsageEntity, key: string): number {
  const used = entity.mpQuotaUsage?.[key]
  const n = Number(used)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function parseQuotaLimit(cell: TierCell): { limit: number; unlimited: boolean; enabled: boolean } {
  if (cell === '—' || cell === dash()) return { limit: 0, unlimited: false, enabled: false }
  if (typeof cell === 'boolean') return { limit: cell ? 1 : 0, unlimited: false, enabled: cell }
  const n = Number(cell)
  if (!Number.isFinite(n) || n <= 0) return { limit: 0, unlimited: false, enabled: false }
  if (n >= 9999) return { limit: n, unlimited: true, enabled: true }
  return { limit: n, unlimited: false, enabled: true }
}

export function buildMembershipAccessRecord(
  role: MpLibraryRole,
  subject: RegistryMpPrUser | RegistryMpTalentMember | null | undefined,
): MpMembershipAccessRecord & { mpMembershipExpiresAt?: string | null } {
  if (!subject) return { mpMembershipPlan: 'basic' }
  if (role === 'pr') {
    const pr = subject as RegistryMpPrUser
    return {
      mpMembershipPlan: pr.mpMembershipPlan,
      mpMembershipExpiresAt: pr.mpMembershipExpiresAt,
      prFeatureAccess: pr.prFeatureAccess,
    }
  }
  const member = subject as RegistryMpTalentMember
  return {
    mpMembershipPlan: member.mpMembershipPlan,
    mpMembershipExpiresAt: member.mpMembershipExpiresAt,
    mpFeatureAccess: member.mpFeatureAccess,
  }
}

export function resolveEffectivePermissionRows(
  role: MpLibraryRole,
  record: MpMembershipAccessRecord & { mpMembershipExpiresAt?: string | null },
  registry: MpPlanVersionRegistrySlice,
) {
  const planId = resolveEffectiveMembershipTier(record.mpMembershipPlan, record.mpMembershipExpiresAt)
  return resolveMpPermissionRowsWithVersions(
    role,
    { ...record, mpMembershipPlan: planId },
    listMembershipPlanVersions(registry, role),
  )
}

export function resolvePermissionEffectiveMap(
  role: MpLibraryRole,
  record: MpMembershipAccessRecord & { mpMembershipExpiresAt?: string | null },
  registry: MpPlanVersionRegistrySlice,
  usageEntity?: MpQuotaUsageEntity | null,
): Record<string, MpPermissionEffectiveRow> {
  const entity = usageEntity ? ensureQuotaUsageMonth(usageEntity) : null
  const cells = resolveEffectivePermissionCells(role, record, registry)
  const rows = resolveEffectivePermissionRows(role, record, registry)
  const out: Record<string, MpPermissionEffectiveRow> = {}
  for (const row of rows) {
    const cell = cells[row.key] ?? '—'
    const parsed = parseQuotaLimit(row.kind === 'quota' ? cell : row.enabled)
    const used = entity && row.kind === 'quota' ? readQuotaUsed(entity, row.key) : undefined
    const remaining =
      parsed.unlimited
        ? undefined
        : parsed.enabled && row.kind === 'quota'
          ? Math.max(0, parsed.limit - (used ?? 0))
          : undefined
    out[row.key] = {
      key: row.key,
      enabled: row.enabled,
      quotaLimit: row.kind === 'quota' && parsed.enabled ? parsed.limit : undefined,
      quotaUsed: row.kind === 'quota' ? used : undefined,
      quotaRemaining: remaining,
      unlimited: parsed.unlimited || undefined,
    }
  }
  return out
}

export function resolveEffectiveQuotaCell(
  account: MpAccountRow,
  data: RegistrySnapshot,
  quotaKey: string,
  opts?: { roleHint?: MpLibraryRole | null },
): TierCell {
  const libRole = resolvePointsLibraryRole(data, account, opts)
  const subject =
    libRole === 'pr'
      ? findRegistryPrForAccount(data, account)
      : findRegistryMemberForAccount(data, account)
  const record = buildMembershipAccessRecord(libRole, subject)
  const cells = resolveEffectivePermissionCells(libRole, record, data)
  return cells[quotaKey] ?? '—'
}

function isBooleanCellEnabled(cell: TierCell): boolean {
  if (cell === '—' || cell === dash()) return false
  return cell === true
}

export type MpQuotaSpendSplit = {
  quotaKey: string | null
  quotaUnitsUsed: number
  pointsRequired: number
  quotaApplied: boolean
}

/** 视频检核：一律积分（参考分钟不抵扣）；文稿：次桶；Brief 仅校验 boolean 开通 */
export function computeQuotaSpendSplit(
  role: MpLibraryRole,
  kind: MpPointsUsageKind,
  quotaCell: TierCell,
  usedBefore: number,
  opts?: { durationSec?: number },
): MpQuotaSpendSplit {
  const quotaKey = quotaKeyForUsageKind(role, kind)
  if (kind === 'brief') {
    const enabled = isBooleanCellEnabled(quotaCell)
    return {
      quotaKey: 'ai_brief_gen',
      quotaUnitsUsed: 0,
      pointsRequired: enabled ? mpPointsCostForUsage('brief') : mpPointsCostForUsage('brief'),
      quotaApplied: false,
    }
  }
  if (!quotaKey) {
    return {
      quotaKey: null,
      quotaUnitsUsed: 0,
      pointsRequired: mpPointsCostForUsage(kind, opts),
      quotaApplied: false,
    }
  }
  const { limit, unlimited, enabled } = parseQuotaLimit(quotaCell)
  if (!enabled) {
    return {
      quotaKey,
      quotaUnitsUsed: 0,
      pointsRequired: mpPointsCostForUsage(kind, opts),
      quotaApplied: false,
    }
  }
  if (isMpPointsAddonGenerationKind(kind)) {
    const durationSec = Math.max(1, Math.ceil(Number(opts?.durationSec) || 1))
    if (unlimited || usedBefore < limit) {
      return { quotaKey, quotaUnitsUsed: 1, pointsRequired: 0, quotaApplied: true }
    }
    return {
      quotaKey,
      quotaUnitsUsed: 0,
      pointsRequired: mpPointsCostForUsage(kind, { durationSec }),
      quotaApplied: false,
    }
  }
  if (kind === 'video') {
    const durationSec = Math.max(1, Math.ceil(Number(opts?.durationSec) || 1))
    /**
     * 成片 AI 检核：套餐「参考分钟/月」仅作权益展示，实际一律按积分扣（套餐桶+充值桶）。
     * 与目录文案「实际按积分扣 / 2 积分/秒」对齐，禁止用参考分钟抵扣后出现「余额不足仍能检核」。
     */
    return {
      quotaKey,
      quotaUnitsUsed: 0,
      pointsRequired: mpPointsCostForUsage('video', { durationSec }),
      quotaApplied: false,
    }
  }
  if (unlimited || usedBefore < limit) {
    return { quotaKey, quotaUnitsUsed: 1, pointsRequired: 0, quotaApplied: true }
  }
  return {
    quotaKey,
    quotaUnitsUsed: 0,
    pointsRequired: mpPointsCostForUsage(kind, opts),
    quotaApplied: false,
  }
}

export function applyQuotaUsageToTarget(
  data: RegistrySnapshot,
  role: MpLibraryRole,
  targetId: string,
  quotaKey: string,
  units: number,
): void {
  if (!quotaKey || units <= 0) return
  const entity = readQuotaEntity(data, role, targetId)
  if (!entity) return
  const month = currentGiftMonthKey()
  const normalized = ensureQuotaUsageMonth(entity, month)
  const prev = readQuotaUsed(normalized, quotaKey)
  writeQuotaEntity(data, role, targetId, {
    mpQuotaUsageMonth: month,
    mpQuotaUsage: { ...(normalized.mpQuotaUsage ?? {}), [quotaKey]: prev + units },
  })
}

export function computeAccountQuotaSpendSplit(
  data: RegistrySnapshot,
  account: MpAccountRow,
  kind: MpPointsUsageKind,
  opts?: { durationSec?: number; roleHint?: MpLibraryRole | null },
): MpQuotaSpendSplit {
  const role = resolvePointsLibraryRole(data, account, opts)
  const target = resolveRegistryTargetIdForAccount(data, account, role)
  const quotaKey = quotaKeyForUsageKind(role, kind)
  if (kind === 'brief') {
    const briefCell = resolveEffectiveQuotaCell(account, data, 'ai_brief_gen', opts)
    const enabled = isBooleanCellEnabled(briefCell)
    return {
      quotaKey: 'ai_brief_gen',
      quotaUnitsUsed: 0,
      pointsRequired: enabled ? mpPointsCostForUsage('brief') : mpPointsCostForUsage('brief'),
      quotaApplied: false,
    }
  }
  if (!quotaKey) {
    return {
      quotaKey: null,
      quotaUnitsUsed: 0,
      pointsRequired: mpPointsCostForUsage(kind, opts),
      quotaApplied: false,
    }
  }
  const entity = readQuotaEntity(data, role, target)
  const usageEntity = entity ? ensureQuotaUsageMonth(entity) : null
  const usedBefore = usageEntity ? readQuotaUsed(usageEntity, quotaKey) : 0
  const cell = resolveEffectiveQuotaCell(account, data, quotaKey, opts)
  return computeQuotaSpendSplit(role, kind, cell, usedBefore, opts)
}
