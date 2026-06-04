export type MpWorkIdentity = 'talent' | 'shoot' | 'edit' | 'pr'

const KEY = 'lingqi_mp_work_identity_v1'

const LABELS: Record<MpWorkIdentity, string> = {
  talent: '达人',
  shoot: '拍摄团队',
  edit: '剪辑团队',
  pr: 'PR',
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
