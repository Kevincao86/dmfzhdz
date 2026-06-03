export type MpAccountRole = 'talent' | 'pr'

export type MpAccount = {
  accountId: string
  openid: string | null
  loginName: string | null
  activeRole: MpAccountRole
  lingqiTalentId: string | null
  lingqiPrId: string | null
  wxNickName: string | null
  wxAvatarUrl: string | null
  hasPassword: boolean
}

const TOKEN_KEY = 'lingqi_mp_session_token'
const ACCOUNT_KEY = 'lingqi_mp_account'
const ROLE_KEY = 'lingqi_mp_active_role'

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setSession(token: string, account: MpAccount) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account))
  localStorage.setItem(ROLE_KEY, account.activeRole)
}

export function getAccount(): MpAccount | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
    return raw ? (JSON.parse(raw) as MpAccount) : null
  } catch {
    return null
  }
}

export function getActiveRole(): MpAccountRole {
  const r = localStorage.getItem(ROLE_KEY)
  return r === 'pr' ? 'pr' : 'talent'
}

export function setActiveRole(role: MpAccountRole) {
  localStorage.setItem(ROLE_KEY, role)
  const acc = getAccount()
  if (acc) {
    acc.activeRole = role
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc))
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ACCOUNT_KEY)
  localStorage.removeItem(ROLE_KEY)
}
