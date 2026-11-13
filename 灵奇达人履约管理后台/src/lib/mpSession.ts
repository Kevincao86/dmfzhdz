import { onAccountLogin, onAccountLogout } from './mpAccountLocalScope'
import { identityFromAccount, setWorkIdentity, workIdentityToAccountRole } from './mpWorkIdentity'

export type MpAccountRole = 'talent' | 'pr'

export type MpAccount = {
  accountId: string
  openid: string | null
  dyOpenid?: string | null
  loginName: string | null
  activeRole: MpAccountRole
  lingqiTalentId: string | null
  lingqiPrId: string | null
  lingqiShootTeamId?: string | null
  lingqiEditTeamId?: string | null
  workIdentity?: string | null
  registryMemberId?: string | null
  registryPrId?: string | null
  mpAiPointsBalance?: number
  mpMembershipPlan?: string
  mpMembershipExpiresAt?: string
  wxNickName: string | null
  wxAvatarUrl: string | null
  hasPassword: boolean
  needsPhoneBind?: boolean
  identities?: {
    wechat: boolean
    douyin: boolean
    phone: boolean
    email: boolean
    phoneMasked: string
    emailMasked: string
  }
  prFeatureAccess?: {
    addons: boolean
    recommendHall: boolean
    shortvideo?: boolean
    cloudEdit?: boolean
    digitalHuman?: boolean
    visualStudio?: boolean
    aiDrama?: boolean
    talentEval?: boolean
    talentAdvice?: boolean
    brief?: boolean
    aiVideoReview?: boolean
    aiReview?: boolean
  }
}

const TOKEN_KEY = 'lingqi_mp_session_token'
const ACCOUNT_KEY = 'lingqi_mp_account'
const ROLE_KEY = 'lingqi_mp_active_role'
const LOGIN_ROLE_PREF_KEY = 'lingqi_mp_login_role_pref'
export const DEV_PREVIEW_TOKEN = 'dev-preview-local'

export function getLoginRolePref(): MpAccountRole {
  const r = localStorage.getItem(LOGIN_ROLE_PREF_KEY)
  return r === 'pr' ? 'pr' : 'talent'
}

export function setLoginRolePref(role: MpAccountRole) {
  localStorage.setItem(LOGIN_ROLE_PREF_KEY, role)
}

export function isDevPreviewSession(): boolean {
  return getToken() === DEV_PREVIEW_TOKEN
}

/** 仅本地 dev：无账号时预览后台布局与大厅 */
export function enterDevPreview(role: MpAccountRole): void {
  if (!import.meta.env.DEV) return
  const account: MpAccount = {
    accountId: 'dev-preview',
    openid: null,
    loginName: 'dev预览',
    activeRole: role,
    lingqiTalentId: role === 'talent' ? 'T-DEV-001' : null,
    lingqiPrId: role === 'pr' ? 'PR-DEV-001' : null,
    wxNickName: '开发预览',
    wxAvatarUrl: null,
    hasPassword: false,
  }
  setSession(DEV_PREVIEW_TOKEN, account)
  setActiveRole(role)
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

/** 登录版本以账号库为准，写回本地身份 */
export function reconcileActiveRoleWithWorkIdentity(account?: MpAccount | null): MpAccountRole {
  const acc = account || getAccount()
  const workId = identityFromAccount(acc)
  setWorkIdentity(workId)
  const role = workIdentityToAccountRole(workId)
  if (acc) {
    acc.activeRole = role
    acc.workIdentity = workId
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc))
  }
  localStorage.setItem(ROLE_KEY, role)
  return role
}

/** 仅更新本地账号快照，不触发注册表拉取（避免 profile 回写时递归） */
export function persistAccount(account: MpAccount) {
  const workId = identityFromAccount(account)
  setWorkIdentity(workId)
  const merged = { ...account, activeRole: workIdentityToAccountRole(workId), workIdentity: workId }
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(merged))
  localStorage.setItem(ROLE_KEY, merged.activeRole)
}

export function setSession(token: string, account: MpAccount) {
  localStorage.setItem(TOKEN_KEY, token)
  persistAccount(account)
  onAccountLogin(account)
  void import('./registryProfileSync')
    .then((m) => m.pullRegistryProfileAfterLogin())
    .then(() => import('./mpAccountClientSync').then((c) => c.pullClientStateAfterLogin()))
    .catch(() => {})
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
  return reconcileActiveRoleWithWorkIdentity()
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
  onAccountLogout()
}
