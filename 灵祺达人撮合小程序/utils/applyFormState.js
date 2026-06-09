const memberStore = require('./talentMember.js')
const regionPicker = require('./regionPicker.js')

/** 报名表单空白初始值（探店时间每次需重新选择） */
function emptyApplyFields(douyinLevels) {
  const region = regionPicker.setupRegionState('', '')
  return {
    platformAccount: '',
    platformNickname: '',
    profileLink: '',
    followers: '',
    likesCollects: '',
    douyinSalesLevel: '',
    douyinLevelIndex: 0,
    contact: '',
    wechatId: '',
    quotePrice: '',
    alipayAccount: '',
    visitDate: '',
    visitTimeStart: '',
    visitTimeEnd: '',
    ...region,
  }
}

/** 是否可用会员资料一键填入（已注册且含本平台资料） */
function memberSyncAvailable(member, platform) {
  if (!member) return false
  if (memberStore.memberCoversPlatform(member, platform)) {
    const prof = memberStore.platformProfileFromMember(member, platform)
    if (
      prof &&
      (String(prof.platformAccount || '').trim() || String(prof.platformNickname || '').trim())
    ) {
      return true
    }
  }
  const primary = memberStore.primaryPlatformProfile(member)
  if (!primary) return false
  const orderPlatform = String(platform || '').trim()
  if (orderPlatform && primary.platform !== orderPlatform) return false
  const prof = primary.profile || {}
  return Boolean(
    String(prof.platformAccount || '').trim() || String(prof.platformNickname || '').trim(),
  )
}

/** 从会员资料生成报名表单字段（不含探店时间） */
function applyFieldsFromMember(member, platform, douyinLevels) {
  if (!memberSyncAvailable(member, platform)) return null
  let prof = memberStore.platformProfileFromMember(member, platform)
  if (!prof) {
    const primary = memberStore.primaryPlatformProfile(member)
    if (primary) prof = primary.profile
  }
  if (!prof) return null
  const level = String(prof.douyinSalesLevel || '')
  let douyinLevelIndex = 0
  if (level && Array.isArray(douyinLevels)) {
    const idx = douyinLevels.indexOf(level)
    if (idx >= 0) douyinLevelIndex = idx
  }
  const region = regionPicker.setupRegionState(member.province, member.city)
  return {
    platformAccount: prof.platformAccount || '',
    platformNickname: prof.platformNickname || '',
    profileLink: prof.profileLink || '',
    followers: prof.followers != null && prof.followers !== '' ? String(prof.followers) : '',
    douyinSalesLevel: level,
    douyinLevelIndex,
    contact: member.contact || '',
    wechatId: member.wechatId || '',
    quotePrice: prof.quotePrice || '',
    alipayAccount: member.alipayAccount || prof.alipayAccount || '',
    visitDate: '',
    visitTimeStart: '',
    visitTimeEnd: '',
    ...region,
  }
}

/** 提交前兜底：报名表单缺昵称/账号时用「我的信息」补全 */
function enrichApplicantFromMember(applicant, member, platform) {
  if (!applicant || !member) return applicant
  const fields = applyFieldsFromMember(member, platform, [])
  if (!fields) return applicant
  const next = { ...applicant }
  if (!String(next.platformNickname || next.name || '').trim()) {
    next.platformNickname = fields.platformNickname || ''
    next.name = next.platformNickname
  }
  if (!String(next.platformAccount || '').trim()) next.platformAccount = fields.platformAccount || ''
  if (!String(next.profileLink || '').trim()) next.profileLink = fields.profileLink || ''
  if (!next.followers && fields.followers) {
    next.followers = Number.parseInt(String(fields.followers).replace(/,/g, ''), 10) || 0
  }
  if (!String(next.contact || '').trim()) next.contact = fields.contact || ''
  if (!String(next.wechatId || '').trim()) next.wechatId = fields.wechatId || ''
  if (!String(next.province || '').trim()) next.province = fields.province || ''
  if (!String(next.city || '').trim()) next.city = fields.city || ''
  if (!String(next.douyinSalesLevel || '').trim() && fields.douyinSalesLevel) {
    next.douyinSalesLevel = fields.douyinSalesLevel
  }
  if (!String(next.alipayAccount || '').trim() && fields.alipayAccount) {
    next.alipayAccount = fields.alipayAccount
    next.paymentMethod = `支付宝：${fields.alipayAccount}`
  }
  return next
}

module.exports = {
  emptyApplyFields,
  memberSyncAvailable,
  applyFieldsFromMember,
  enrichApplicantFromMember,
}
