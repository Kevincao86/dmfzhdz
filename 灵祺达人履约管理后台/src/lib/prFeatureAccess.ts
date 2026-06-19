import { getAccount, isDevPreviewSession, type MpAccount } from './mpSession'

export type PrFeatureAccess = {
  addons: boolean
  recommendHall: boolean
}

export function readAccountPrFeatureAccess(account?: MpAccount | null): PrFeatureAccess {
  const acc = account ?? getAccount()
  const raw = acc?.prFeatureAccess
  return {
    addons: raw?.addons === true,
    recommendHall: raw?.recommendHall === true,
  }
}

export function canUsePrRecommendHall(account?: MpAccount | null): boolean {
  if (import.meta.env.DEV && isDevPreviewSession()) return true
  return readAccountPrFeatureAccess(account).recommendHall
}

export function patchAccountPrFeatureAccess(
  account: MpAccount,
  access: Partial<PrFeatureAccess>,
): MpAccount {
  const prev = readAccountPrFeatureAccess(account)
  return {
    ...account,
    prFeatureAccess: {
      addons: typeof access.addons === 'boolean' ? access.addons : prev.addons,
      recommendHall: typeof access.recommendHall === 'boolean' ? access.recommendHall : prev.recommendHall,
    },
  }
}
