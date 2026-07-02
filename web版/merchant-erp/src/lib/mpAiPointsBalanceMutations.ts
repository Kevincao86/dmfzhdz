import type { MpLibraryRole } from './mpMembershipCatalog.js'
import type { RegistryMpPointsCheckoutRequest, RegistrySnapshot } from './opsRegistryTypes.js'
import { applyRechargeCreditToTarget, readMpPointsBucketsForTarget } from './mpAiPointsBuckets.js'
import { readAccountMpAiPointsBalance } from './mpAiPointsSpendCore.js'

export { readAccountMpAiPointsBalance }

export function readMpAiPointsBalanceForTarget(
  data: RegistrySnapshot,
  role: MpLibraryRole,
  targetId: string,
): number {
  return readMpPointsBucketsForTarget(data, role, targetId).total
}

export function creditMpAiPointsFromSnapshot(
  data: RegistrySnapshot,
  checkout: RegistryMpPointsCheckoutRequest,
): { ok: true; newBalance: number } | { ok: false; error: string } {
  const delta = Math.floor(Number(checkout.points) || 0)
  if (delta <= 0) return { ok: false, error: 'invalid_points' }

  const target = String(checkout.registryTargetId || checkout.lingqiId || '').trim()
  if (!target) return { ok: false, error: 'missing_registry_target' }

  const applied = applyRechargeCreditToTarget(data, checkout.role, target, delta)
  if (!applied.ok) return { ok: false, error: applied.error }
  return { ok: true, newBalance: applied.buckets.total }
}
