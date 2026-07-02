/**
 * 星选 AI 积分扣减：月度赠送发放、余额校验、扣费与幂等。
 */
import type { MpLibraryRole, MpMembershipPlanVersion } from './mpMembershipCatalog.js'
import {
  findMembershipPlanVersion,
  listMembershipPlanVersions,
  normalizeMpMembershipTier,
  resolvePlanGiftPoints,
} from './mpMembershipCatalog.js'
import type { MpAccountRow } from './mpAccountAuth.js'
import { findRegistryMemberForAccount, findRegistryPrForAccount } from './mpRegistryProfileGet.js'
import { findMemberForLibraryEntry } from './talentLibraryFilters.js'
import {
  mpPointsCostForUsage,
  type MpPointsUsageKind,
} from './mpPointsEconomics.js'
import type {
  RegistryMpAiPointsSpendEntry,
  RegistryMpPrUser,
  RegistryMpTalentMember,
  RegistrySnapshot,
} from './opsRegistryTypes.js'
import { shanghaiDateString } from '../../vite-plugins/aiTokenUsageCore.js'

export type MpAiPointsSpendResult =
  | { ok: true; pointsCharged: number; newBalance: number; already?: boolean }
  | {
      ok: false
      error: 'insufficient_points' | 'not_found' | 'invalid_amount' | 'duplicate_pending'
      message: string
      required?: number
      balance?: number
    }

function currentGiftMonthKey(d = new Date()): string {
  return shanghaiDateString(d).slice(0, 7)
}

function readBalanceFromPr(user: RegistryMpPrUser | null | undefined): number {
  const n = Number(user?.mpAiPointsBalance)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function readBalanceFromMember(member: RegistryMpTalentMember | null | undefined): number {
  const n = Number(member?.mpAiPointsBalance)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function resolveAccountLibraryRole(data: RegistrySnapshot, account: MpAccountRow): MpLibraryRole {
  if (account.active_role === 'pr') return 'pr'
  const member = findRegistryMemberForAccount(data, account)
  const wi = member?.workIdentity
  if (wi === 'shoot' || wi === 'edit') return wi
  return 'talent'
}

export function resolveRegistryTargetIdForAccount(
  data: RegistrySnapshot,
  account: MpAccountRow,
  role: MpLibraryRole,
): string {
  if (role === 'pr') {
    const prId = String(account.registry_pr_id || '').trim()
    if (prId) return prId
    const lq = String(account.lingqi_pr_id || '').trim()
    const hit = (data.mpPrUsers ?? []).find((u) => u.lingqiPrId === lq || u.id === lq)
    return hit?.id || lq
  }
  const memberId = String(account.registry_member_id || '').trim()
  if (memberId) return memberId
  if (role === 'talent') {
    const lq = String(account.lingqi_talent_id || '').trim()
    const entry = (data.talentLibraryEntries ?? []).find((e) => e.lingqiTalentId === lq || e.id === lq)
    return entry?.id || memberId || lq
  }
  const listKey = role === 'shoot' ? 'shootTeamLibraryEntries' : 'editTeamLibraryEntries'
  const entry = (data[listKey] ?? []).find((e) => e.memberId === memberId)
  return entry?.id || memberId
}

function resolveMembershipPlanForAccount(
  data: RegistrySnapshot,
  account: MpAccountRow,
  role: MpLibraryRole,
): MpMembershipPlanVersion {
  const tierRaw =
    role === 'pr'
      ? findRegistryPrForAccount(data, account)?.mpMembershipPlan
      : findRegistryMemberForAccount(data, account)?.mpMembershipPlan
  const tier = normalizeMpMembershipTier(String(tierRaw || 'basic'))
  const versions = listMembershipPlanVersions(data, role)
  return (
    findMembershipPlanVersion(versions, tier) ||
    findMembershipPlanVersion(versions, 'basic') || {
      id: 'basic',
      name: '基础版',
      permissions: {},
    }
  )
}

function applyGiftMonthToPr(user: RegistryMpPrUser, month: string, giftPts: number): RegistryMpPrUser {
  const prev = readBalanceFromPr(user)
  return {
    ...user,
    mpAiPointsBalance: prev + giftPts,
    mpAiPointsGiftMonth: month,
    updatedAt: new Date().toISOString(),
  }
}

function applyGiftMonthToMember(member: RegistryMpTalentMember, month: string, giftPts: number): RegistryMpTalentMember {
  const prev = readBalanceFromMember(member)
  return {
    ...member,
    mpAiPointsBalance: prev + giftPts,
    mpAiPointsGiftMonth: month,
    updatedAt: new Date().toISOString(),
  }
}

/** 每月首次消耗/查询时发放当前档位赠送积分（自然月，上海时区） */
export function ensureMonthlyGiftPointsGranted(
  data: RegistrySnapshot,
  account: MpAccountRow,
): { granted: number; newBalance: number } {
  const role = resolveAccountLibraryRole(data, account)
  const month = currentGiftMonthKey()
  const plan = resolveMembershipPlanForAccount(data, account, role)
  const giftPts = resolvePlanGiftPoints(plan, role)
  if (giftPts <= 0) {
    return { granted: 0, newBalance: readAccountMpAiPointsBalance(data, account) }
  }

  if (role === 'pr') {
    const target = resolveRegistryTargetIdForAccount(data, account, role)
    const users = data.mpPrUsers ?? []
    const idx = users.findIndex((u) => u.id === target || u.lingqiPrId === target)
    if (idx < 0) return { granted: 0, newBalance: 0 }
    const prev = users[idx]!
    if (String(prev.mpAiPointsGiftMonth || '').trim() === month) {
      return { granted: 0, newBalance: readBalanceFromPr(prev) }
    }
    const next = applyGiftMonthToPr(prev, month, giftPts)
    users[idx] = next
    data.mpPrUsers = users
    return { granted: giftPts, newBalance: readBalanceFromPr(next) }
  }

  const target = resolveRegistryTargetIdForAccount(data, account, role)
  const members = data.mpTalentMembers ?? []
  const midx = members.findIndex((m) => m.id === target || String(m.lingqiTalentId || '').trim() === target)

  if (midx >= 0) {
    const prev = members[midx]!
    if (String(prev.mpAiPointsGiftMonth || '').trim() === month) {
      return { granted: 0, newBalance: readBalanceFromMember(prev) }
    }
    const next = applyGiftMonthToMember(prev, month, giftPts)
    members[midx] = next
    data.mpTalentMembers = members
    if (role === 'talent') {
      const entries = data.talentLibraryEntries ?? []
      const eidx = entries.findIndex((e) => e.id === target || String(e.lingqiTalentId || '').trim() === target)
      if (eidx >= 0) {
        entries[eidx] = { ...entries[eidx]!, mpAiPointsBalance: next.mpAiPointsBalance }
        data.talentLibraryEntries = entries
      }
    }
    return { granted: giftPts, newBalance: readBalanceFromMember(next) }
  }

  if (role === 'talent') {
    const entries = data.talentLibraryEntries ?? []
    const eidx = entries.findIndex((e) => e.id === target || String(e.lingqiTalentId || '').trim() === target)
    if (eidx >= 0) {
      const entry = entries[eidx]!
      const member = findMemberForLibraryEntry(entry, members)
      if (member) {
        const mi = members.findIndex((m) => m.id === member.id)
        if (mi >= 0) {
          const prev = members[mi]!
          if (String(prev.mpAiPointsGiftMonth || '').trim() === month) {
            return { granted: 0, newBalance: readBalanceFromMember(prev) }
          }
          const next = applyGiftMonthToMember(prev, month, giftPts)
          members[mi] = next
          data.mpTalentMembers = members
          entries[eidx] = { ...entry, mpAiPointsBalance: next.mpAiPointsBalance }
          data.talentLibraryEntries = entries
          return { granted: giftPts, newBalance: readBalanceFromMember(next) }
        }
      }
    }
  }

  return { granted: 0, newBalance: readAccountMpAiPointsBalance(data, account) }
}

export function readAccountMpAiPointsBalance(data: RegistrySnapshot, account: MpAccountRow): number {
  const pr = findRegistryPrForAccount(data, account)
  if (pr) return readBalanceFromPr(pr)
  const member = findRegistryMemberForAccount(data, account)
  return readBalanceFromMember(member)
}

function appendSpendLedger(
  data: RegistrySnapshot,
  entry: RegistryMpAiPointsSpendEntry,
): void {
  const prev = data.mpAiPointsSpendLedger ?? []
  data.mpAiPointsSpendLedger = [entry, ...prev].slice(0, 800)
}

function findIdempotentSpend(
  data: RegistrySnapshot,
  accountId: string,
  idempotencyKey: string,
): RegistryMpAiPointsSpendEntry | undefined {
  const key = String(idempotencyKey || '').trim()
  if (!key) return undefined
  return (data.mpAiPointsSpendLedger ?? []).find(
    (row) => String(row.accountId || '') === accountId && String(row.idempotencyKey || '') === key,
  )
}

function applyBalanceDelta(
  data: RegistrySnapshot,
  role: MpLibraryRole,
  targetId: string,
  delta: number,
): { ok: true; newBalance: number } | { ok: false; error: string } {
  const id = String(targetId || '').trim()
  if (!id) return { ok: false, error: 'missing_registry_target' }
  const change = Math.floor(Number(delta) || 0)
  if (change === 0) return { ok: false, error: 'invalid_amount' }

  if (role === 'pr') {
    const users = data.mpPrUsers ?? []
    const idx = users.findIndex((u) => u.id === id || u.lingqiPrId === id)
    if (idx < 0) return { ok: false, error: 'not_found' }
    const prev = users[idx]!
    const newBalance = readBalanceFromPr(prev) + change
    if (newBalance < 0) return { ok: false, error: 'insufficient_points' }
    users[idx] = { ...prev, mpAiPointsBalance: newBalance, updatedAt: new Date().toISOString() }
    data.mpPrUsers = users
    return { ok: true, newBalance }
  }

  if (role === 'talent') {
    const entries = data.talentLibraryEntries ?? []
    const members = data.mpTalentMembers ?? []
    const eidx = entries.findIndex((e) => e.id === id || String(e.lingqiTalentId || '').trim() === id)
    const midx = members.findIndex((m) => m.id === id || String(m.lingqiTalentId || '').trim() === id)

    if (midx >= 0) {
      const prev = members[midx]!
      const newBalance = readBalanceFromMember(prev) + change
      if (newBalance < 0) return { ok: false, error: 'insufficient_points' }
      members[midx] = { ...prev, mpAiPointsBalance: newBalance, updatedAt: new Date().toISOString() }
      data.mpTalentMembers = members
      if (eidx >= 0) {
        entries[eidx] = { ...entries[eidx]!, mpAiPointsBalance: newBalance }
        data.talentLibraryEntries = entries
      }
      return { ok: true, newBalance }
    }

    if (eidx >= 0) {
      const entry = entries[eidx]!
      const member = findMemberForLibraryEntry(entry, members)
      if (member) {
        const mi = members.findIndex((m) => m.id === member.id)
        if (mi >= 0) {
          const newBalance = readBalanceFromMember(member) + change
          if (newBalance < 0) return { ok: false, error: 'insufficient_points' }
          members[mi] = { ...member, mpAiPointsBalance: newBalance, updatedAt: new Date().toISOString() }
          data.mpTalentMembers = members
          entries[eidx] = { ...entry, mpAiPointsBalance: newBalance }
          data.talentLibraryEntries = entries
          return { ok: true, newBalance }
        }
      }
      const newBalance = (Number(entry.mpAiPointsBalance) || 0) + change
      if (newBalance < 0) return { ok: false, error: 'insufficient_points' }
      entries[eidx] = { ...entry, mpAiPointsBalance: newBalance }
      data.talentLibraryEntries = entries
      return { ok: true, newBalance }
    }

    return { ok: false, error: 'not_found' }
  }

  const listKey = role === 'shoot' ? 'shootTeamLibraryEntries' : 'editTeamLibraryEntries'
  const entry = (data[listKey] ?? []).find((e) => e.id === id)
  if (!entry?.memberId) return { ok: false, error: 'member_not_linked' }
  const members = data.mpTalentMembers ?? []
  const midx = members.findIndex((m) => m.id === entry.memberId)
  if (midx < 0) return { ok: false, error: 'not_found' }
  const prev = members[midx]!
  const newBalance = readBalanceFromMember(prev) + change
  if (newBalance < 0) return { ok: false, error: 'insufficient_points' }
  members[midx] = { ...prev, mpAiPointsBalance: newBalance, updatedAt: new Date().toISOString() }
  data.mpTalentMembers = members
  return { ok: true, newBalance }
}

export function computeMpAiPointsCharge(
  kind: MpPointsUsageKind,
  opts?: { durationSec?: number },
): number {
  return mpPointsCostForUsage(kind, opts)
}

export function formatMpAiPointsInsufficient(balance: number, required: number): string {
  return `积分不足（当前 ${balance.toLocaleString('zh-CN')}，需要 ${required.toLocaleString('zh-CN')}），请先充值或等待下月赠送积分到账`
}

export function spendMpAiPointsWithSnapshot(
  data: RegistrySnapshot,
  account: MpAccountRow,
  opts: {
    kind: MpPointsUsageKind
    durationSec?: number
    idempotencyKey?: string
    note?: string
    skipMonthlyGift?: boolean
  },
): MpAiPointsSpendResult {
  const accountId = String(account.id || '').trim()
  if (!accountId) {
    return { ok: false, error: 'not_found', message: '账号无效' }
  }

  const idempotencyKey = String(opts.idempotencyKey || '').trim()
  if (idempotencyKey) {
    const hit = findIdempotentSpend(data, accountId, idempotencyKey)
    if (hit) {
      return {
        ok: true,
        pointsCharged: hit.points,
        newBalance: hit.balanceAfter,
        already: true,
      }
    }
  }

  if (!opts.skipMonthlyGift) {
    ensureMonthlyGiftPointsGranted(data, account)
  }

  const role = resolveAccountLibraryRole(data, account)
  const target = resolveRegistryTargetIdForAccount(data, account, role)
  const points = computeMpAiPointsCharge(opts.kind, { durationSec: opts.durationSec })
  if (points <= 0) {
    return { ok: false, error: 'invalid_amount', message: '无效扣费金额' }
  }

  const balanceBefore = readAccountMpAiPointsBalance(data, account)
  if (balanceBefore < points) {
    return {
      ok: false,
      error: 'insufficient_points',
      message: formatMpAiPointsInsufficient(balanceBefore, points),
      required: points,
      balance: balanceBefore,
    }
  }

  const applied = applyBalanceDelta(data, role, target, -points)
  if (!applied.ok) {
    if (applied.error === 'insufficient_points') {
      return {
        ok: false,
        error: 'insufficient_points',
        message: formatMpAiPointsInsufficient(balanceBefore, points),
        required: points,
        balance: balanceBefore,
      }
    }
    return { ok: false, error: 'not_found', message: '未找到账号资料，请先完善注册信息' }
  }

  appendSpendLedger(data, {
    id: `mpspend_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    accountId,
    idempotencyKey: idempotencyKey || undefined,
    kind: opts.kind,
    points,
    balanceAfter: applied.newBalance,
    createdAt: new Date().toISOString(),
    note: opts.note,
  })

  return { ok: true, pointsCharged: points, newBalance: applied.newBalance }
}

export function assertMpAiPointsAffordable(
  data: RegistrySnapshot,
  account: MpAccountRow,
  kind: MpPointsUsageKind,
  opts?: { durationSec?: number },
): MpAiPointsSpendResult {
  ensureMonthlyGiftPointsGranted(data, account)
  const points = computeMpAiPointsCharge(kind, opts)
  const balance = readAccountMpAiPointsBalance(data, account)
  if (balance < points) {
    return {
      ok: false,
      error: 'insufficient_points',
      message: formatMpAiPointsInsufficient(balance, points),
      required: points,
      balance,
    }
  }
  return { ok: true, pointsCharged: points, newBalance: balance }
}
