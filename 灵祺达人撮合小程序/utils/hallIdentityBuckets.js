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

/** 只列出当前身份能报名的单。PR 浏览全部开放商单。 */
function orderMatchesIdentity(row, identity) {
  if (!row) return false
  if (identity === 'pr') return true
  const target = row.recruitTarget || 'talent'
  if (row.isIce || target === 'edit') return identity === 'edit'
  if (identity === 'shoot') return target === 'shoot'
  return identity === 'talent' && target === 'talent'
}

/** 拍剪分栏只给 PR 浏览用；达人/拍摄/剪辑的可报名单已在招募大厅。 */
function hallTabVisibility(identity) {
  if (identity === 'pr') {
    return { showPaichianTab: true, showShootSub: true, showEditSub: true, showIceSub: true }
  }
  return { showPaichianTab: false, showShootSub: false, showEditSub: false, showIceSub: false }
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
    editRows = primaryRows
      .filter((r) => r.recruitTarget === 'edit')
      .concat(iceRows.filter((r) => r.recruitTarget === 'edit'))
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
  hallTabVisibility,
  defaultPaichianSubTab,
  bucketOrdersForIdentity,
}
