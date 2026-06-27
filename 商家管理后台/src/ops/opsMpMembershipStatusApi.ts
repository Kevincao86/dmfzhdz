import {
  listMembershipPlanVersions,
  resolveMpPermissionRows,
  resolvePlanVersionLabel,
  type MpLibraryRole,
  type MpMembershipAccessRecord,
  type MpPermissionRow,
} from '../meooRegistryShared/mpMembershipCatalog'
import { findMemberForLibraryEntry } from '../meooRegistryShared/talentLibraryFilters'
import { fetchRegistry, type RegistryFile, type RegistryMpMembershipCheckoutRequest } from './opsRegistryApi'
import {
  mpMembershipPlanLabel,
  mpMembershipRoleLabel,
  mpMembershipStatusLabel,
  type MpMembershipFinanceRow,
  yuan,
} from './opsMpMembershipFinanceApi'

export type MpMembershipStatusRecord = {
  role: MpLibraryRole
  targetId: string
  title: string
  subtitle: string
  mpMembershipPlan: string
  mpMembershipExpiresAt?: string
  mpFeatureAccess?: MpMembershipAccessRecord['mpFeatureAccess']
  prFeatureAccess?: MpMembershipAccessRecord['prFeatureAccess']
}

export type MpMembershipExpiryState = 'lifetime' | 'active' | 'expired' | 'unknown'

export function resolveMembershipExpiryState(
  planId: string,
  expiresAt?: string,
): MpMembershipExpiryState {
  const plan = String(planId || 'basic').trim() || 'basic'
  if (plan === 'basic') return 'lifetime'
  if (!expiresAt) return 'unknown'
  const t = new Date(expiresAt).getTime()
  if (Number.isNaN(t)) return 'unknown'
  return t > Date.now() ? 'active' : 'expired'
}

export function formatMembershipExpiryLabel(
  planId: string,
  expiresAt?: string,
): string {
  const state = resolveMembershipExpiryState(planId, expiresAt)
  if (state === 'lifetime') return '永久免费（基础版）'
  if (state === 'unknown') return '未记录到期时间'
  const d = new Date(expiresAt!)
  const text = d.toLocaleString('zh-CN', { hour12: false })
  if (state === 'expired') return `${text}（已过期）`
  return text
}

function findStatusRecord(
  reg: RegistryFile,
  role: MpLibraryRole,
  targetId: string,
): MpMembershipStatusRecord | null {
  const id = String(targetId || '').trim()
  if (!id) return null

  if (role === 'pr') {
    const u = (reg.mpPrUsers ?? []).find((x) => x.id === id || x.lingqiPrId === id)
    if (!u) return null
    return {
      role,
      targetId: u.id,
      title: u.accountType === 'personal' ? u.personalName || u.lingqiPrId : u.companyName || u.lingqiPrId,
      subtitle: u.lingqiPrId,
      mpMembershipPlan: String(u.mpMembershipPlan || 'basic'),
      mpMembershipExpiresAt: u.mpMembershipExpiresAt,
      prFeatureAccess: u.prFeatureAccess,
    }
  }

  if (role === 'talent') {
    const e = (reg.talentLibraryEntries ?? []).find(
      (x) => x.id === id || String(x.lingqiTalentId || '').trim() === id,
    )
    if (!e) return null
    const member = findMemberForLibraryEntry(e, reg.mpTalentMembers ?? [])
    const access = member?.mpFeatureAccess ?? e.mpFeatureAccess
    const plan = member?.mpMembershipPlan ?? e.mpMembershipPlan
    const expiresAt = member?.mpMembershipExpiresAt ?? e.mpMembershipExpiresAt
    return {
      role,
      targetId: e.id,
      title: e.platformNickname || e.platformAccount,
      subtitle: e.lingqiTalentId || e.platformAccount,
      mpMembershipPlan: String(plan || 'basic'),
      mpMembershipExpiresAt: expiresAt,
      mpFeatureAccess: access,
    }
  }

  const listKey = role === 'shoot' ? 'shootTeamLibraryEntries' : 'editTeamLibraryEntries'
  const team = (reg[listKey] ?? []).find((x) => x.id === id)
  if (!team) return null
  const member = team.memberId
    ? (reg.mpTalentMembers ?? []).find((m) => m.id === team.memberId)
    : undefined
  return {
    role,
    targetId: team.id,
    title: team.wxNickName || team.lingqiTeamId || team.id,
    subtitle: team.lingqiTeamId || team.memberId || team.id,
    mpMembershipPlan: String(member?.mpMembershipPlan || 'basic'),
    mpMembershipExpiresAt: member?.mpMembershipExpiresAt,
    mpFeatureAccess: member?.mpFeatureAccess,
  }
}

export function listCheckoutHistoryForTarget(
  rows: RegistryMpMembershipCheckoutRequest[],
  record: MpMembershipStatusRecord,
): MpMembershipFinanceRow[] {
  const keys = new Set(
    [record.targetId, record.subtitle].map((x) => String(x || '').trim()).filter(Boolean),
  )
  return rows
    .filter((row) => {
      if (row.role !== record.role) return false
      const targets = [row.registryTargetId, row.lingqiId, row.accountId]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
      return targets.some((t) => keys.has(t))
    })
    .sort((a, b) => new Date(b.paidAt || b.createdAt).getTime() - new Date(a.paidAt || a.createdAt).getTime())
}

export async function fetchMpMembershipStatus(
  role: MpLibraryRole,
  targetId: string,
): Promise<{
  record: MpMembershipStatusRecord | null
  permissionRows: MpPermissionRow[]
  planLabel: string
  checkoutHistory: MpMembershipFinanceRow[]
}> {
  const reg = await fetchRegistry()
  const record = findStatusRecord(reg, role, targetId)
  if (!record) {
    return { record: null, permissionRows: [], planLabel: '', checkoutHistory: [] }
  }
  const planVersions = listMembershipPlanVersions(reg, record.role)
  const permissionRows = resolveMpPermissionRows(record.role, record, planVersions).filter((r) => r.enabled)
  const planLabel = resolvePlanVersionLabel(record.mpMembershipPlan, planVersions)
  const checkoutHistory = listCheckoutHistoryForTarget(reg.mpMembershipCheckoutRequests ?? [], record)
  return { record, permissionRows, planLabel, checkoutHistory }
}

export function membershipStatusPath(role: MpLibraryRole, targetId: string): string {
  return `/mp-membership-status/${role}/${encodeURIComponent(targetId)}`
}

export function checkoutRowStatusTarget(row: MpMembershipFinanceRow): string {
  return String(row.registryTargetId || row.lingqiId || row.accountId || '').trim()
}

export function checkoutHistoryRowLabel(row: MpMembershipFinanceRow): string {
  return [
    mpMembershipStatusLabel(row.status),
    mpMembershipPlanLabel(row.planId),
    row.billing === 'yearly' ? '年付' : '月付',
    `¥${yuan(row.amountCents)}`,
  ].join(' · ')
}

export function membershipRoleLabel(role: MpLibraryRole): string {
  return mpMembershipRoleLabel(role)
}
