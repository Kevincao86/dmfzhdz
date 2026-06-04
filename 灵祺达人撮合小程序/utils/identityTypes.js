/** 工作台身份（本地切换，与 mp_accounts.active_role 的 talent/pr 独立） */
const WORK_IDENTITIES = {
  talent: { id: 'talent', label: '达人', emoji: '🎭' },
  shoot: { id: 'shoot', label: '拍摄团队', emoji: '📷' },
  edit: { id: 'edit', label: '剪辑团队', emoji: '✂️' },
  pr: { id: 'pr', label: 'PR', emoji: '💼' },
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

module.exports = {
  WORK_IDENTITIES,
  WORK_ID_LIST,
  isWorkIdentity,
  isSupplierWorkIdentity,
  workIdentityLabel,
}
