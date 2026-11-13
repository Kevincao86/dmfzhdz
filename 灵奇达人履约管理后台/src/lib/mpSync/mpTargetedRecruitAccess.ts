import {
  buildBuiltinPlanVersions,
  normalizeMpMembershipTier,
  resolveEffectiveMembershipTier,
} from '@merchant/lib/mpMembershipCatalog'
import { getAccount, getActiveRole } from '../mpSession'

function cellEnabled(val: unknown) {
  if (val === true) return true
  if (typeof val === 'number' && val > 0) return true
  return false
}

export function canUseTargetedRecruit() {
  if (getActiveRole() !== 'pr') return false
  const acc = getAccount()
  const tier = resolveEffectiveMembershipTier(acc?.mpMembershipPlan, acc?.mpMembershipExpiresAt)
  const planId = normalizeMpMembershipTier(tier)
  const plan = buildBuiltinPlanVersions('pr').find((p) => p.id === planId)
  const cell = plan?.permissions?.targeted_recruit
  return cellEnabled(cell)
}
