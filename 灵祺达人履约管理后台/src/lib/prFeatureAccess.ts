import { getAccount, isDevPreviewSession, type MpAccount } from './mpSession'

export type MpAddonAccess = {
  shortvideo: boolean
  cloudEdit: boolean
  digitalHuman: boolean
  brief: boolean
  any: boolean
}

export type PrFeatureAccess = MpAddonAccess & {
  addons: boolean
  recommendHall: boolean
}

const EMPTY_ADDON: MpAddonAccess = {
  shortvideo: false,
  cloudEdit: false,
  digitalHuman: false,
  brief: false,
  any: false,
}

export function readAccountPrFeatureAccess(account?: MpAccount | null): PrFeatureAccess {
  const acc = account ?? getAccount()
  const raw = acc?.prFeatureAccess
  const shortvideo = raw?.shortvideo === true
  const cloudEdit = raw?.cloudEdit === true
  const digitalHuman = raw?.digitalHuman === true
  const brief = raw?.brief === true
  const legacyAddons = raw?.addons === true
  const any = legacyAddons || shortvideo || cloudEdit || digitalHuman || brief
  return {
    addons: any,
    recommendHall: raw?.recommendHall === true,
    shortvideo: shortvideo || (legacyAddons && raw?.shortvideo !== false),
    cloudEdit: cloudEdit || (legacyAddons && raw?.cloudEdit !== false),
    digitalHuman: digitalHuman || (legacyAddons && raw?.digitalHuman !== false),
    brief,
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
      brief: typeof access.brief === 'boolean' ? access.brief : prev.brief,
    },
  }
}
