const { isEditTeamIceMpOrder, isIceMpOrder } = require('./iceOrderDetect.js')
const iceOrderStats = require('./iceOrderStats.js')
const { parseRecruitCountFromMp } = require('./mpRecruitCount.js')

function recruitTargetFromMpOrder(mp) {
  if (!mp) return 'talent'
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const t = String(meta.recruitTarget || mp.recruitTarget || '').trim()
  if (t === 'shoot' || t === 'edit') return t
  return 'talent'
}

function isEditTeamRecruitment(mp) {
  if (!mp) return false
  if (isEditTeamIceMpOrder(mp)) return true
  return recruitTargetFromMpOrder(mp) === 'edit'
}

/** 大厅：剪辑类招募全身份可见（含剪辑云剪任务包） */
function hallOrderVisibleToIdentity(row, _identity) {
  if (!row) return false
  if (row.recruitTarget === 'edit') return true
  if (row.isIce) return true
  if (_identity === 'pr' || _identity === 'talent') return true
  if (_identity === 'shoot') return row.recruitTarget === 'shoot'
  if (_identity === 'edit') return row.recruitTarget === 'edit'
  return true
}

function hallOrderMatchesIdentityPool(row, identity) {
  return hallOrderVisibleToIdentity(row, identity)
}

function validateRecruitmentClaim(mp, workIdentity) {
  const wid = String(workIdentity || '').trim()
  if (!wid || wid === 'pr') {
    return {
      ok: false,
      message: '请切换为达人 / 拍摄 / 剪辑身份后再报名',
      code: 'wrong_identity',
    }
  }

  const target = recruitTargetFromMpOrder(mp)
  const editTeam = isEditTeamRecruitment(mp)

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
  const v = validateRecruitmentClaim(mp || {}, workIdentity)
  if (!v.ok) return v.message
  if (mp && isIceMpOrder(mp)) {
    const cap = parseRecruitCountFromMp(mp)
    if (iceOrderStats.isIceSlotsFull(mp, cap)) return '任务已收满'
  }
  return ''
}

module.exports = {
  recruitTargetFromMpOrder,
  isEditTeamRecruitment,
  hallOrderVisibleToIdentity,
  hallOrderMatchesIdentityPool,
  validateRecruitmentClaim,
  claimBlockHint,
}
