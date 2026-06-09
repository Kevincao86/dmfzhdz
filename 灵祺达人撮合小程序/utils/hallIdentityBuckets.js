/**
 * 招募大厅按工作台身份分桶：达人 / 拍摄 / 剪辑 各看对应招募单 + 云剪
 */
const userProfile = require('./userProfile.js')
const listFilters = require('./recruitmentListFilters.js')

function primaryRecruitTargetForIdentity(identity) {
  if (identity === 'shoot') return 'shoot'
  if (identity === 'edit') return 'edit'
  return 'talent'
}

function orderMatchesIdentity(row, identity) {
  if (!row) return false
  if (row.isIce) return true
  /** 招募大厅公开展示：达人/PR 可见全部对象（含剪辑/拍摄单） */
  if (identity === 'pr' || identity === 'talent') return true
  return row.recruitTarget === primaryRecruitTargetForIdentity(identity)
}

function defaultPaichianSubTab(identity) {
  if (identity === 'edit') return 'edit'
  if (identity === 'shoot') return 'shoot'
  return 'ice'
}

function bucketOrdersForIdentity(mapped, identity, opts) {
  const id = identity || userProfile.readIdentity()
  const pool = (mapped || []).filter((r) => orderMatchesIdentity(r, id))
  const urgentRows = pool.filter((r) => r.urgent)
  const nonUrgent = pool.filter((r) => !r.urgent)
  const primaryRows = pool.filter((r) => !r.isIce)
  const iceRows = pool.filter((r) => r.isIce)

  let shootRows = []
  let editRows = []
  if (id === 'shoot') shootRows = primaryRows
  else if (id === 'edit') editRows = primaryRows
  else if (id === 'pr' || id === 'talent') {
    shootRows = primaryRows.filter((r) => r.recruitTarget === 'shoot')
    editRows = primaryRows.filter((r) => r.recruitTarget === 'edit')
  }

  const normalRows = listFilters.mergeHallDisplayRows(nonUrgent, {
    allowDemo: opts && opts.allowDemo === true,
  })

  return {
    normalRows,
    urgentRows,
    shootRows,
    editRows,
    iceRows,
  }
}

module.exports = {
  primaryRecruitTargetForIdentity,
  orderMatchesIdentity,
  defaultPaichianSubTab,
  bucketOrdersForIdentity,
}
