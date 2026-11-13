import { migrateLegacyKeyToScoped, scopedStorageKey } from '../mpAccountLocalScope'

const WX_KEY = 'meoo_wx_account_v1'

function wxAccountStorageKey() {
  return scopedStorageKey(WX_KEY)
}

export type WxAccount = {
  wxNickName?: string
  wxAvatarUrl?: string
  wxOpenId?: string
}

export function readWxAccount(): WxAccount | null {
  try {
    migrateLegacyKeyToScoped(WX_KEY)
    const raw = localStorage.getItem(wxAccountStorageKey())
    if (!raw) return null
    return JSON.parse(raw) as WxAccount
  } catch {
    return null
  }
}

export function writeWxAccount(acc: WxAccount) {
  localStorage.setItem(wxAccountStorageKey(), JSON.stringify(acc))
  try {
    localStorage.removeItem(WX_KEY)
  } catch {
    /* ignore */
  }
}
