/**
 * 星选积分余额摘要：套餐额度与充值积分分桶展示。
 */
import type { MpAccountRow } from './mpAccountAuth.js'
import {
  findMembershipPlanVersion,
  listMembershipPlanVersions,
  resolveEffectiveMembershipTier,
  resolvePlanGiftPoints,
  type MpLibraryRole,
} from './mpMembershipCatalog.js'
import { readAccountMpPointsBuckets } from './mpAiPointsSpendCore.js'
import { resolveAccountLibraryRole } from './mpAiPointsSpendCore.js'
import type { RegistrySnapshot } from './opsRegistryTypes.js'
import { findRegistryMemberForAccount, findRegistryPrForAccount } from './mpRegistryProfileGet.js'
import { shanghaiDateString } from '../../vite-plugins/aiTokenUsageCore.js'

export type MpAiPointsBalanceSummary = {
  balance: number
  effectivePlanId: string
  storedPlanId: string
  membershipExpired: boolean
  membershipExpiresAt?: string
  monthlyGiftQuota: number
  monthlyGiftGranted: boolean
  monthlySpent: number
  packageRemaining: number
  rechargeBalance: number
}

function currentGiftMonthKey(d = new Date()): string {
  return shanghaiDateString(d).slice(0, 7)
}

function readGiftMonth(data: RegistrySnapshot, account: MpAccountRow, role: MpLibraryRole): string {
  if (role === 'pr') {
    const pr = findRegistryPrForAccount(data, account)
    return String(pr?.mpAiPointsGiftMonth || '').trim()
  }
  const member = findRegistryMemberForAccount(data, account)
  return String(member?.mpAiPointsGiftMonth || '').trim()
}

function readMembershipMeta(
  data: RegistrySnapshot,
  account: MpAccountRow,
  role: MpLibraryRole,
): { storedPlanId: string; expiresAt?: string } {
  if (role === 'pr') {
    const pr = findRegistryPrForAccount(data, account)
    return {
      storedPlanId: String(pr?.mpMembershipPlan || 'basic').trim() || 'basic',
      expiresAt: pr?.mpMembershipExpiresAt,
    }
  }
  const member = findRegistryMemberForAccount(data, account)
  return {
    storedPlanId: String(member?.mpMembershipPlan || 'basic').trim() || 'basic',
    expiresAt: member?.mpMembershipExpiresAt,
  }
}

function sumMonthlySpend(data: RegistrySnapshot, accountId: string, monthKey: string): number {
  const id = String(accountId || '').trim()
  if (!id) return 0
  return (data.mpAiPointsSpendLedger ?? [])
    .filter((row) => {
      if (String(row.accountId || '') !== id) return false
      const at = String(row.createdAt || '')
      return at.slice(0, 7) === monthKey
    })
    .reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row.points) || 0)), 0)
}

export function buildMpAiPointsBalanceSummary(
  data: RegistrySnapshot,
  account: MpAccountRow,
): MpAiPointsBalanceSummary {
  const role = resolveAccountLibraryRole(data, account)
  const month = currentGiftMonthKey()
  const { storedPlanId, expiresAt } = readMembershipMeta(data, account, role)
  const effectivePlanId = resolveEffectiveMembershipTier(storedPlanId, expiresAt)
  const membershipExpired =
    effectivePlanId === 'basic' && storedPlanId !== 'basic' && Boolean(expiresAt?.trim())

  const versions = listMembershipPlanVersions(data, role)
  const plan =
    findMembershipPlanVersion(versions, effectivePlanId) ||
    findMembershipPlanVersion(versions, 'basic') || {
      id: 'basic',
      name: '基础版',
      permissions: {},
    }

  const monthlyGiftQuota = resolvePlanGiftPoints(plan, role)
  const monthlyGiftGranted = readGiftMonth(data, account, role) === month
  const monthlySpent = sumMonthlySpend(data, String(account.id || ''), month)
  const buckets = readAccountMpPointsBuckets(data, account)

  return {
    balance: buckets.total,
    effectivePlanId,
    storedPlanId,
    membershipExpired,
    membershipExpiresAt: expiresAt?.trim() || undefined,
    monthlyGiftQuota,
    monthlyGiftGranted,
    monthlySpent,
    packageRemaining: buckets.package,
    rechargeBalance: buckets.recharge,
  }
}
