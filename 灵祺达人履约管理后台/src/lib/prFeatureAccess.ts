import { getAccount, isDevPreviewSession, type MpAccount } from './mpSession'

export type MpAddonAccess = {
  shortvideo: boolean
  cloudEdit: boolean
  digitalHuman: boolean
  visualStudio: boolean
  brief: boolean
  aiVideoReview: boolean
  aiReview: boolean
  any: boolean
}

export type PrFeatureAccess = MpAddonAccess & {
  addons: boolean
  recommendHall: boolean
}

export function readAccountPrFeatureAccess(account?: MpAccount | null): PrFeatureAccess {
  const acc = account ?? getAccount()
  const raw = acc?.prFeatureAccess
  const shortvideo = raw?.shortvideo === true
  const cloudEdit = raw?.cloudEdit === true
  const digitalHuman = raw?.digitalHuman === true
  const visualStudio = raw?.visualStudio === true
  const brief = raw?.brief === true
  const aiVideoReview = raw?.aiVideoReview === true
  const aiReview = raw?.aiReview === true
  const legacyAddons = raw?.addons === true
  const any =
    legacyAddons ||
    shortvideo ||
    cloudEdit ||
    digitalHuman ||
    visualStudio ||
    brief ||
    aiVideoReview ||
    aiReview
  return {
    addons: any,
    recommendHall: raw?.recommendHall === true,
    shortvideo: shortvideo || (legacyAddons && raw?.shortvideo !== false),
    cloudEdit: cloudEdit || (legacyAddons && raw?.cloudEdit !== false),
    digitalHuman: digitalHuman || (legacyAddons && raw?.digitalHuman !== false),
    visualStudio: visualStudio || (legacyAddons && raw?.visualStudio !== false),
    brief,
    aiVideoReview,
    aiReview,
    any,
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
      shortvideo: typeof access.shortvideo === 'boolean' ? access.shortvideo : prev.shortvideo,
      cloudEdit: typeof access.cloudEdit === 'boolean' ? access.cloudEdit : prev.cloudEdit,
      digitalHuman: typeof access.digitalHuman === 'boolean' ? access.digitalHuman : prev.digitalHuman,
      visualStudio: typeof access.visualStudio === 'boolean' ? access.visualStudio : prev.visualStudio,
      brief: typeof access.brief === 'boolean' ? access.brief : prev.brief,
      aiVideoReview: typeof access.aiVideoReview === 'boolean' ? access.aiVideoReview : prev.aiVideoReview,
      aiReview: typeof access.aiReview === 'boolean' ? access.aiReview : prev.aiReview,
    },
  }
}
