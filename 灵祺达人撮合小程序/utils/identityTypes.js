/** 工作台身份（本地切换，与 mp_accounts.active_role 的 talent/pr 独立） */
const WORK_IDENTITIES = {
  talent: { id: 'talent', label: '达人', glyph: '达' },
  shoot: { id: 'shoot', label: '拍摄团队', glyph: '拍' },
  edit: { id: 'edit', label: '剪辑团队', glyph: '剪' },
  pr: { id: 'pr', label: 'PR', glyph: 'PR' },
}

const WORK_ID_LIST = ['talent', 'shoot', 'edit', 'pr']

function isWorkIdentity(id) {
  return WORK_ID_LIST.includes(id)
}

function isSupplierWorkIdentity(id) {
  return id === 'talent' || id === 'shoot' || id === 'edit'
}

function workIdentityLabel(id) {
  const key = isWorkIdentity(id) ? id : 'talent'
  return WORK_IDENTITIES[key].label
}

function primaryRecruitTargetForIdentity(id) {
  if (id === 'shoot') return 'shoot'
  if (id === 'edit') return 'edit'
  return 'talent'
}

/** 服务端 mp_accounts.active_role：达人/拍摄/剪辑 → talent，PR → pr */
function accountRoleForWorkIdentity(id) {
  return id === 'pr' ? 'pr' : 'talent'
}

module.exports = {
  WORK_IDENTITIES,
  WORK_ID_LIST,
  isWorkIdentity,
  isSupplierWorkIdentity,
  workIdentityLabel,
  primaryRecruitTargetForIdentity,
  accountRoleForWorkIdentity,
}
