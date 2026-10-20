export type MpWorkIdentity = 'talent' | 'shoot' | 'edit' | 'pr'

const KEY = 'lingqi_mp_work_identity_v1'
const OWNED_KEY = 'lingqi_mp_owned_identities_v1'

export const WORK_ID_LIST: MpWorkIdentity[] = ['talent', 'shoot', 'edit', 'pr']

/** 落地页 / 登录注册入口展示 */
export const WORK_EDITION_LABEL: Record<MpWorkIdentity, string> = {
  talent: '达人版',
  shoot: '拍摄团队',
  edit: '剪辑团队',
  pr: 'PR 版',
}

const LABELS: Record<MpWorkIdentity, string> = {
  talent: '达人',
  shoot: '拍摄团队',
  edit: '剪辑团队',
  pr: 'PR',
}

export function parseWorkIdentityQuery(raw: string | null | undefined): MpWorkIdentity {
  if (raw === 'pr' || raw === 'shoot' || raw === 'edit') return raw
  return 'talent'
}

/** 账号体系仅 talent / pr；拍摄/剪辑注册为 talent 并保留工作台身份 */
export function workIdentityToAccountRole(id: MpWorkIdentity): 'talent' | 'pr' {
  return id === 'pr' ? 'pr' : 'talent'
}

export function identityFromAccount(
  account?: { workIdentity?: string | null; activeRole?: string | null } | null,
): MpWorkIdentity {
  const raw = account?.workIdentity
  if (raw === 'talent' || raw === 'shoot' || raw === 'edit' || raw === 'pr') return raw
  if (account?.activeRole === 'pr') return 'pr'
  return 'talent'
}

export function getWorkIdentity(): MpWorkIdentity {
  const v = localStorage.getItem(KEY)
  if (v === 'pr' || v === 'shoot' || v === 'edit') return v
  return 'talent'
}

export function setWorkIdentity(id: MpWorkIdentity) {
  localStorage.setItem(KEY, id)
}

const SUPPLIER_IDS: MpWorkIdentity[] = ['talent', 'shoot', 'edit']

export function readOwnedWorkIdentities(): MpWorkIdentity[] {
  try {
    const raw = JSON.parse(localStorage.getItem(OWNED_KEY) || '[]') as unknown
    const list = Array.isArray(raw)
      ? raw.filter((id): id is MpWorkIdentity => SUPPLIER_IDS.includes(id as MpWorkIdentity))
      : []
    if (list.length) return [...new Set(list)].slice(0, 3)
  } catch {
    /* empty */
  }
  const current = getWorkIdentity()
  return current === 'pr' ? [] : [current]
}

export function writeOwnedWorkIdentities(list: MpWorkIdentity[]) {
  const next = [...new Set(list.filter((id) => SUPPLIER_IDS.includes(id)))].slice(0, 3)
  localStorage.setItem(OWNED_KEY, JSON.stringify(next))
  return next
}

export function noteOwnedWorkIdentity(id: MpWorkIdentity) {
  if (!SUPPLIER_IDS.includes(id)) return readOwnedWorkIdentities()
  const list = readOwnedWorkIdentities()
  if (!list.includes(id) && list.length < 3) list.push(id)
  return writeOwnedWorkIdentities(list)
}

export function adoptOwnedFromAccount(account?: {
  workIdentity?: string | null
  activeRole?: string | null
  ownedWorkIdentities?: string[] | null
  lingqiTalentId?: string | null
  lingqiShootTeamId?: string | null
  lingqiEditTeamId?: string | null
} | null): MpWorkIdentity {
  const server = Array.isArray(account?.ownedWorkIdentities)
    ? account.ownedWorkIdentities.filter((id): id is MpWorkIdentity => SUPPLIER_IDS.includes(id as MpWorkIdentity))
    : []
  const derived = [...server]
  if (!derived.length && account) {
    const wid = String(account.workIdentity || '').trim()
    const talentId = String(account.lingqiTalentId || '').trim()
    if (wid === 'talent' || (talentId && wid !== 'shoot' && wid !== 'edit')) derived.push('talent')
    if (account.lingqiShootTeamId || wid === 'shoot') derived.push('shoot')
    if (account.lingqiEditTeamId || wid === 'edit') derived.push('edit')
  }
  let id = identityFromAccount(account)
  if (id !== 'pr' && derived.includes('talent') && (derived.includes('shoot') || derived.includes('edit'))) {
    id = 'talent'
  }
  if (id !== 'pr') writeOwnedWorkIdentities(derived.length ? derived : [id])
  setWorkIdentity(id)
  return id
}

export function workIdentityLabel(id?: MpWorkIdentity) {
  return LABELS[id || getWorkIdentity()]
}

export function isSupplierWorkIdentity(id?: MpWorkIdentity) {
  const x = id || getWorkIdentity()
  return x === 'talent' || x === 'shoot' || x === 'edit'
}

export function accountRoleForWorkIdentity(id: MpWorkIdentity): 'talent' | 'pr' {
  return workIdentityToAccountRole(id)
}
