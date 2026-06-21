import type { RegistryMpPrUser } from './opsRegistryTypes.js'

/** PR 星选功能开通（运营台 PR 用户库维护，同步履约 Web / 小程序） */
export type PrFeatureAccess = {
  addons: boolean
  recommendHall: boolean
}

export type PrFeatureAccessPatch = Partial<PrFeatureAccess>

export const DEFAULT_PR_FEATURE_ACCESS: PrFeatureAccess = {
  addons: false,
  recommendHall: false,
}

export function resolveFeatureAccess(
  raw?: PrFeatureAccessPatch | null,
): PrFeatureAccess {
  return {
    addons: raw?.addons === true,
    recommendHall: raw?.recommendHall === true,
  }
}

export function resolvePrFeatureAccess(
  pr?: Pick<RegistryMpPrUser, 'prFeatureAccess'> | null,
): PrFeatureAccess {
  return resolveFeatureAccess(pr?.prFeatureAccess)
}

export function resolveMpFeatureAccess(
  member?: { mpFeatureAccess?: PrFeatureAccessPatch } | null,
): PrFeatureAccess {
  return resolveFeatureAccess(member?.mpFeatureAccess)
}

export function mergePrFeatureAccessPatch(
  current: PrFeatureAccessPatch | undefined,
  patch: PrFeatureAccessPatch,
): PrFeatureAccessPatch {
  const base = current && typeof current === 'object' ? { ...current } : {}
  if (typeof patch.addons === 'boolean') base.addons = patch.addons
  if (typeof patch.recommendHall === 'boolean') base.recommendHall = patch.recommendHall
  return base
}
