export type MpWorkIdentity = 'talent' | 'shoot' | 'edit' | 'pr'

const KEY = 'lingqi_mp_work_identity_v1'

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

export function getWorkIdentity(): MpWorkIdentity {
  const v = localStorage.getItem(KEY)
  if (v === 'pr' || v === 'shoot' || v === 'edit') return v
  return 'talent'
}

export function setWorkIdentity(id: MpWorkIdentity) {
  localStorage.setItem(KEY, id)
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
