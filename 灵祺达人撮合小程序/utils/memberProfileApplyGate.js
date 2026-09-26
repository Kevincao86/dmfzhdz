const basicContact = require('./basicContactFields.js')
const { validateRegion } = require('./regionPicker.js')
const { validatePlatformProfile } = require('./platformForm.js')
const talentPlatforms = require('./talentPlatformProfiles.js')
const supplierTeamProfile = require('./supplierTeamProfile.js')

function validateGender(gender) {
  const g = String(gender || '').trim()
  if (g !== '男' && g !== '女') return '请选择性别'
  return null
}

function validateBasicMemberFields(member) {
  const contactErr = basicContact.validateBasicContactFields(member || {})
  if (contactErr) return contactErr
  const genderErr = validateGender(member && member.gender)
  if (genderErr) return genderErr
  return validateRegion(member && member.province, member && member.city)
}

function validateTalentPlatforms(member) {
  const profiles = (member && member.platformProfiles) || {}
  const enabled = talentPlatforms.TALENT_PLATFORMS.filter((p) => profiles[p.id]?.enabled)
  if (!enabled.length) return '请至少开启并填写一个平台资料'
  for (const p of enabled) {
    const err = validatePlatformProfile(p.name, profiles[p.id])
    if (err) return `${p.name}：${err}`
  }
  return null
}

function validateMemberProfileForApply(member, workIdentity) {
  const wid = String(workIdentity || 'talent').trim()
  if (wid === 'pr') return '请切换为达人 / 拍摄 / 剪辑身份后再报名'
  if (!member) {
    if (wid === 'shoot') return '请先完善拍摄团队信息'
    if (wid === 'edit') return '请先完善剪辑团队信息'
    return '请先完善我的信息'
  }
  const basicErr = validateBasicMemberFields(member)
  if (basicErr) return basicErr
  if (wid === 'shoot' || wid === 'edit') {
    return supplierTeamProfile.validateSupplierProfile(wid, member.supplierProfile, {
      wxNickName: member.wxNickName,
      contact: member.contact,
      wechatId: member.wechatId,
      alipayAccount: member.alipayAccount,
      gender: member.gender,
      province: member.province,
      city: member.city,
    })
  }
  return validateTalentPlatforms(member)
}

function isMemberProfileComplete(member, workIdentity) {
  return !validateMemberProfileForApply(member, workIdentity)
}

/** 资料未完整时说明缺什么，确认后再去完善。身份不对时去切换，不退出登录。 */
function ensureMemberProfileForApplyOrRedirect(member, workIdentity) {
  const err = validateMemberProfileForApply(member, workIdentity)
  if (!err) return true
  if (String(workIdentity || '').trim() === 'pr') {
    const switchWorkIdentity = require('./switchWorkIdentity.js')
    wx.showModal({
      title: '切换身份',
      content: '报名需要达人、拍摄或剪辑身份，切换后不用重新登录。',
      confirmText: '去切换',
      success(res) {
        if (res.confirm) void switchWorkIdentity.promptPickIdentity()
      },
    })
    return false
  }
  const mpProfileNav = require('./mpProfileNav.js')
  wx.showModal({
    title: '请先完善资料',
    content: err,
    confirmText: '去完善',
    success(res) {
      if (res.confirm) mpProfileNav.goMyProfile()
    },
  })
  return false
}

/** 招募认领门禁 + 资料完整性（详情页/报名页共用；资料未完整优先拦截） */
function resolveApplyGateHint(mp, workIdentity, member) {
  const profileErr = validateMemberProfileForApply(member, workIdentity)
  if (profileErr) return profileErr
  const recruitApplyGate = require('./recruitApplyGate.js')
  return recruitApplyGate.claimBlockHint(mp, workIdentity) || ''
}

module.exports = {
  validateGender,
  validateBasicMemberFields,
  validateTalentPlatforms,
  validateMemberProfileForApply,
  isMemberProfileComplete,
  ensureMemberProfileForApplyOrRedirect,
  resolveApplyGateHint,
}
