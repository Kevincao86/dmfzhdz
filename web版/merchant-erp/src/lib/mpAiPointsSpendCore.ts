/**
 * 星选 AI 积分扣减：月度赠送发放、余额校验、扣费与幂等。
 */
import type { MpLibraryRole, MpMembershipPlanVersion } from './mpMembershipCatalog.js'
import {
  findMembershipPlanVersion,
  listMembershipPlanVersions,
  resolveEffectiveMembershipTier,
  resolvePlanGiftPoints,
} from './mpMembershipCatalog.js'
import type { MpAccountRow } from './mpAccountAuth.js'
import { findRegistryMemberForAccount, findRegistryPrForAccount } from './mpRegistryProfileGet.js'
import {
  applySpendPackageFirstToTarget,
  grantPackagePointsDeltaToTarget,
  readMpPointsBucketsForTarget,
  type MpPointsBuckets,
} from './mpAiPointsBuckets.js'
import {
  mpPointsCostForUsage,
  type MpPointsUsageKind,
} from './mpPointsEconomics.js'
import type { RegistryMpAiPointsSpendEntry, RegistrySnapshot } from './opsRegistryTypes.js'
import {
  applyQuotaUsageToTarget,
  computeAccountQuotaSpendSplit,
  resolveEffectiveQuotaCell,
} from './mpMembershipQuota.js'

export type MpAiPointsSpendResult =
  | { ok: true; pointsCharged: number; newBalance: number; already?: boolean }
  | {
      ok: false
      error: 'insufficient_points' | 'not_found' | 'invalid_amount' | 'duplicate_pending'
      message: string
      required?: number
      balance?: number
    }

export { readMpPointsBucketsForTarget }

/** 积分/配额计费身份：PR 登录时走 PR 注册表，与会员页展示一致 */
export function resolvePointsLibraryRole(
  data: RegistrySnapshot,
  account: MpAccountRow,
  opts?: { roleHint?: MpLibraryRole | null },
): MpLibraryRole {
  const hint = opts?.roleHint
  if (hint === 'pr' || hint === 'talent' || hint === 'shoot' || hint === 'edit') {
    if (hint === 'pr' && !findRegistryPrForAccount(data, account)) {
      return resolveAccountLibraryRole(data, account)
    }
    return hint
  }
  if (account.active_role === 'pr') {
    const pr = findRegistryPrForAccount(data, account)
    if (pr) return 'pr'
  }
  return resolveAccountLibraryRole(data, account)
}

export function readAccountMpPointsBuckets(
  data: RegistrySnapshot,
  account: MpAccountRow,
  opts?: { roleHint?: MpLibraryRole | null },
): MpPointsBuckets {
  const role = resolvePointsLibraryRole(data, account, opts)
  const target = resolveRegistryTargetIdForAccount(data, account, role)
  return readMpPointsBucketsForTarget(data, role, target)
}

export function readAccountMpAiPointsBalance(
  data: RegistrySnapshot,
  account: MpAccountRow,
  opts?: { roleHint?: MpLibraryRole | null },
): number {
  return readAccountMpPointsBuckets(data, account, opts).total
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
    const pr = findRegistryPrForAccount(data, account)
    if (pr?.id) return pr.id
    const prId = String(account.registry_pr_id || '').trim()
    if (prId) return prId
    const lq = String(account.lingqi_pr_id || '').trim()
    const hit = (data.mpPrUsers ?? []).find((u) => u.lingqiPrId === lq || u.id === lq)
    return hit?.id || lq
  }
  const member = findRegistryMemberForAccount(data, account)
  if (member?.id) return member.id
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
  const expiresAt =
    role === 'pr'
      ? findRegistryPrForAccount(data, account)?.mpMembershipExpiresAt
      : findRegistryMemberForAccount(data, account)?.mpMembershipExpiresAt
  const tier = resolveEffectiveMembershipTier(String(tierRaw || 'basic'), expiresAt)
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

/** 每月首次消耗/查询时发放当前档位赠送积分至套餐桶（自然月，上海时区） */
export function ensureMonthlyGiftPointsGranted(
  data: RegistrySnapshot,
  account: MpAccountRow,
  opts?: { roleHint?: MpLibraryRole | null },
): { granted: number; newBalance: number } {
  const role = resolvePointsLibraryRole(data, account, opts)
  const plan = resolveMembershipPlanForAccount(data, account, role)
  const giftPts = resolvePlanGiftPoints(plan, role)
  const target = resolveRegistryTargetIdForAccount(data, account, role)
  const result = grantPackagePointsDeltaToTarget(data, role, target, giftPts, {
    repairAccountId: String(account.id || ''),
  })
  return { granted: result.granted, newBalance: result.newBalance }
}

function appendSpendLedger(data: RegistrySnapshot, entry: RegistryMpAiPointsSpendEntry): void {
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

export function computeMpAiPointsCharge(
  kind: MpPointsUsageKind,
  opts?: { durationSec?: number },
): number {
  return mpPointsCostForUsage(kind, opts)
}

export function formatMpAiPointsInsufficient(balance: number, required: number): string {
  return `积分不足（当前 ${balance.toLocaleString('zh-CN')}，需要 ${required.toLocaleString('zh-CN')}），请先充值或等待会员赠送积分到账`
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
    roleHint?: MpLibraryRole | null
  },
): MpAiPointsSpendResult {
  const roleOpts = { roleHint: opts.roleHint }
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
    ensureMonthlyGiftPointsGranted(data, account, roleOpts)
  }

  const role = resolvePointsLibraryRole(data, account, roleOpts)
  const target = resolveRegistryTargetIdForAccount(data, account, role)
  const split = computeAccountQuotaSpendSplit(data, account, opts.kind, {
    durationSec: opts.durationSec,
    roleHint: opts.roleHint,
  })

  if (opts.kind === 'brief' && resolveEffectiveQuotaCell(account, data, 'ai_brief_gen', roleOpts) !== true) {
    return { ok: false, error: 'not_found', message: '当前档位未开通 AI Brief 生成，请升级会员后使用' }
  }

  const points = split.pointsRequired
  if (points <= 0 && !(split.quotaApplied && split.quotaUnitsUsed > 0)) {
    return { ok: false, error: 'invalid_amount', message: '无效扣费金额' }
  }

  let balanceAfter = readAccountMpAiPointsBalance(data, account, roleOpts)
  if (points > 0) {
    const balanceBefore = balanceAfter
    if (balanceBefore < points) {
      return {
        ok: false,
        error: 'insufficient_points',
        message: formatMpAiPointsInsufficient(balanceBefore, points),
        required: points,
        balance: balanceBefore,
      }
    }

    const applied = applySpendPackageFirstToTarget(data, role, target, points)
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
    balanceAfter = applied.buckets.total
  }

  if (split.quotaApplied && split.quotaKey && split.quotaUnitsUsed > 0) {
    applyQuotaUsageToTarget(data, role, target, split.quotaKey, split.quotaUnitsUsed)
  }

  appendSpendLedger(data, {
    id: `mpspend_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    accountId,
    idempotencyKey: idempotencyKey || undefined,
    kind: opts.kind,
    points,
    balanceAfter,
    createdAt: new Date().toISOString(),
    note: opts.note,
    quotaKey: split.quotaApplied && split.quotaKey ? split.quotaKey : undefined,
    quotaUnitsUsed:
      split.quotaApplied && split.quotaUnitsUsed > 0 ? split.quotaUnitsUsed : undefined,
  })

  return { ok: true, pointsCharged: points, newBalance: balanceAfter }
}

export function assertMpAiPointsAffordable(
  data: RegistrySnapshot,
  account: MpAccountRow,
  kind: MpPointsUsageKind,
  opts?: { durationSec?: number; roleHint?: MpLibraryRole | null },
): MpAiPointsSpendResult {
  const roleOpts = { roleHint: opts?.roleHint }
  ensureMonthlyGiftPointsGranted(data, account, roleOpts)
  if (kind === 'brief' && resolveEffectiveQuotaCell(account, data, 'ai_brief_gen', roleOpts) !== true) {
    return { ok: false, error: 'not_found', message: '当前档位未开通 AI Brief 生成，请升级会员后使用' }
  }
  const split = computeAccountQuotaSpendSplit(data, account, kind, opts)
  const points = split.pointsRequired
  const balance = readAccountMpAiPointsBalance(data, account, roleOpts)
  if (points > 0 && balance < points) {
    return {
      ok: false,
      error: 'insufficient_points',
      message: formatMpAiPointsInsufficient(balance, points),
      required: points,
      balance,
    }
  }
  if (points <= 0 && !(split.quotaApplied && split.quotaUnitsUsed > 0)) {
    return { ok: false, error: 'invalid_amount', message: '无效扣费金额' }
  }
  return { ok: true, pointsCharged: points, newBalance: balance }
}
