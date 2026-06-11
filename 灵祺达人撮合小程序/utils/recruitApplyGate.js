const { isEditTeamIceMp } = require('./iceOrderDetect.js')
const { recruitTargetFromMp } = require('./recruitTarget.js')
const userProfile = require('./userProfile.js')

function isEditTeamRecruitment(mpOrRow) {
  if (!mpOrRow) return false
  if (isEditTeamIceMp(mpOrRow)) return true
  const target = mpOrRow.recruitTarget || recruitTargetFromMp(mpOrRow)
  return target === 'edit'
}

/** 大厅：剪辑类招募全身份可见 */
function hallOrderMatchesIdentity(row, identity) {
  if (!row) return false
  if (row.recruitTarget === 'edit') return true
  if (row.isIce) return true
  if (identity === 'pr' || identity === 'talent') return true
  if (identity === 'shoot') return row.recruitTarget === 'shoot'
  if (identity === 'edit') return row.recruitTarget === 'edit'
  return true
}

function validateRecruitmentClaim(mp, workIdentity) {
  const wid = String(workIdentity || userProfile.readIdentity() || '').trim()
  if (!wid || wid === 'pr') {
    return { ok: false, message: '请切换为达人 / 拍摄 / 剪辑身份后再报名', code: 'wrong_identity' }
  }
  const target = mp ? recruitTargetFromMp(mp) : 'talent'
  const editTeam = mp ? isEditTeamRecruitment(mp) : false

  if (editTeam || target === 'edit') {
    if (wid !== 'edit') {
      return { ok: false, message: '该任务仅限剪辑身份认领', code: 'edit_only' }
    }
    return { ok: true }
  }
  if (target === 'shoot') {
    if (wid !== 'shoot') {
      return { ok: false, message: '该任务仅限拍摄身份报名', code: 'shoot_only' }
    }
    return { ok: true }
  }
  if (wid !== 'talent') {
    return { ok: false, message: '该任务仅限达人身份认领', code: 'talent_only' }
  }
  return { ok: true }
}

function claimBlockHint(mp, workIdentity) {
  const v = validateRecruitmentClaim(mp, workIdentity)
  return v.ok ? '' : v.message
}

function canClaimRecruitment(mp, workIdentity) {
  return validateRecruitmentClaim(mp, workIdentity).ok
}

module.exports = {
  isEditTeamRecruitment,
  hallOrderMatchesIdentity,
  validateRecruitmentClaim,
  claimBlockHint,
  canClaimRecruitment,
}
