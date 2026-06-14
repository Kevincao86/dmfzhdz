import { migrateLegacyKeyToScoped, scopedStorageKey } from '../mpAccountLocalScope'

export const PR_PROFILE_KEY = 'meoo_pr_profile_v1'

function prProfileStorageKey() {
  return scopedStorageKey(PR_PROFILE_KEY)
}

export type PrProfile = {
  accountType: 'company' | 'personal'
  companyName: string
  personalName: string
  contactName: string
  contactPhone: string
  wechatId: string
  province: string
  city: string
  intro: string
  wxNickName: string
  wxAvatarUrl: string
  lingqiPrId: string
  id?: string
  registeredAt?: string
  updatedAt?: string
}

export function emptyPrProfile(): PrProfile {
  return {
    accountType: 'company',
    companyName: '',
    personalName: '',
    contactName: '',
    contactPhone: '',
    wechatId: '',
    province: '',
    city: '',
    intro: '',
    wxNickName: '',
    wxAvatarUrl: '',
    lingqiPrId: '',
    updatedAt: '',
  }
}

export function readPrProfile(): PrProfile | null {
  try {
    migrateLegacyKeyToScoped(PR_PROFILE_KEY)
    const raw = localStorage.getItem(prProfileStorageKey())
    if (!raw) return null
    return JSON.parse(raw) as PrProfile
  } catch {
    return null
  }
}

export function writePrProfile(profile: PrProfile) {
  localStorage.setItem(prProfileStorageKey(), JSON.stringify(profile))
  try {
    localStorage.removeItem(PR_PROFILE_KEY)
  } catch {
    /* ignore */
  }
  import('../mpClientSyncHooks').then((m) => m.notifyLocalClientStateChanged()).catch(() => {})
  import('../shellRefresh').then((m) => m.triggerProfileDisplayRefresh()).catch(() => {})
}

export function prDisplayName(profile: PrProfile | null): string {
  if (!profile) return ''
  if (profile.accountType === 'personal') {
    return String(profile.personalName || profile.contactName || '').trim()
  }
  return String(profile.companyName || profile.contactName || '').trim()
}
