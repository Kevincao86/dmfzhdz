const WX_KEY = 'meoo_wx_account_v1'

export type WxAccount = {
  wxNickName?: string
  wxAvatarUrl?: string
  wxOpenId?: string
}

export function readWxAccount(): WxAccount | null {
  try {
    const raw = localStorage.getItem(WX_KEY)
    if (!raw) return null
    return JSON.parse(raw) as WxAccount
  } catch {
    return null
  }
}

export function writeWxAccount(acc: WxAccount) {
  localStorage.setItem(WX_KEY, JSON.stringify(acc))
}
