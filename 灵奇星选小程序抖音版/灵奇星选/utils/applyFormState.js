const memberStore = require('./talentMember.js')
const regionPicker = require('./regionPicker.js')
const talentPlatforms = require('./talentPlatformProfiles.js')
const supplierTeamProfile = require('./supplierTeamProfile.js')

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

/** 拍摄 / 剪辑团队报名表单空白初始值 */
function emptySupplierApplyFields() {
  const region = regionPicker.setupRegionState('', '')
  return {
    teamName: '',
    portfolioLink: '',
    editStyles: '',
    software: '',
    deliveryEta: '',
    shootTypes: '',
    equipment: '',
    shootDate: '',
    contact: '',
    wechatId: '',
    quotePrice: '',
    alipayAccount: '',
    platformAccount: '',
    platformNickname: '',
    profileLink: '',
    followers: '',
    likesCollects: '',
    douyinSalesLevel: '',
    douyinLevelIndex: 0,
    visitDate: '',
    visitTimeStart: '',
    visitTimeEnd: '',
    ...region,
  }
}

function supplierMemberSyncAvailable(member, workId) {
  if (!member || (workId !== 'shoot' && workId !== 'edit')) return false
  const p = supplierTeamProfile.normalizeSupplierProfile(member.supplierProfile)
  return Boolean(String(p.teamName || '').trim() && String(member.contact || '').trim())
}

function applyFieldsFromSupplierMember(member, workId) {
  if (!supplierMemberSyncAvailable(member, workId)) return null
  const p = supplierTeamProfile.normalizeSupplierProfile(member.supplierProfile)
  const region = regionPicker.setupRegionState(member.province, member.city)
  const base = {
    teamName: p.teamName || member.wxNickName || '',
    contact: member.contact || '',
    wechatId: member.wechatId || '',
    portfolioLink: p.portfolioLink || '',
    quotePrice: String(p.perClipQuote || p.fullDayQuote || p.halfDayQuote || '').trim(),
    alipayAccount: member.alipayAccount || '',
    ...region,
  }
  if (workId === 'edit') {
    return {
      ...base,
      editStyles: (p.editStyles || []).join('、'),
      software: (p.software || []).join('、'),
      deliveryEta: '',
    }
  }
  return {
    ...base,
    shootTypes: (p.shootTypes || []).join('、'),
    equipment: (p.equipment || []).join('、'),
    shootDate: '',
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
function enrichApplicantFromMember(applicant, member, platform, options) {
  if (!applicant || !member) return applicant
  const isSupplierApply = options && options.isSupplierApply
  const workId = options && options.workId
  if (isSupplierApply && (workId === 'shoot' || workId === 'edit')) {
    const fields = applyFieldsFromSupplierMember(member, workId)
    if (!fields) return applicant
    const next = { ...applicant }
    if (!String(next.teamName || next.name || '').trim()) {
      next.teamName = fields.teamName || ''
      next.name = next.teamName
      next.platformNickname = next.teamName
    }
    if (!String(next.contact || '').trim()) next.contact = fields.contact || ''
    if (!String(next.wechatId || '').trim()) next.wechatId = fields.wechatId || ''
    if (!String(next.province || '').trim()) next.province = fields.province || ''
    if (!String(next.city || '').trim()) next.city = fields.city || ''
    if (!String(next.portfolioLink || next.profileLink || '').trim()) {
      next.portfolioLink = fields.portfolioLink || ''
      next.profileLink = next.portfolioLink
    }
    if (!String(next.quotePrice || '').trim() && fields.quotePrice) next.quotePrice = fields.quotePrice
    if (!String(next.alipayAccount || '').trim() && fields.alipayAccount) {
      next.alipayAccount = fields.alipayAccount
      next.paymentMethod = `支付宝：${fields.alipayAccount}`
    }
    return next
  }
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

function strEmpty(v) {
  return !String(v == null ? '' : v).trim()
}

/** 报名成功后：仅将「我的信息」中空缺项写回对应平台资料 */
function persistApplicantToMemberProfile(member, applicant, platform) {
  if (!applicant) return member
  const base =
    member && typeof member === 'object'
      ? { ...member }
      : { platformProfiles: talentPlatforms.emptyAllProfiles() }
  if (!base.platformProfiles) base.platformProfiles = talentPlatforms.emptyAllProfiles()
  const pid = talentPlatforms.platformIdFromName(platform)
  const profiles = { ...base.platformProfiles }
  const cur = talentPlatforms.normalizeProfile(profiles[pid])
  const next = { ...cur, enabled: true }
  let profileChanged = false

  const fillProf = (key, val) => {
    if (strEmpty(cur[key]) && !strEmpty(val)) {
      next[key] = String(val).trim()
      profileChanged = true
    }
  }

  fillProf('platformAccount', applicant.platformAccount)
  fillProf('platformNickname', applicant.platformNickname)
  fillProf('profileLink', applicant.profileLink)
  if (strEmpty(cur.followers) && applicant.followers != null && String(applicant.followers).trim()) {
    next.followers = String(applicant.followers)
    profileChanged = true
  }
  fillProf('douyinSalesLevel', applicant.douyinSalesLevel)
  fillProf('quotePrice', applicant.quotePrice)
  if (Array.isArray(applicant.accountTags) && applicant.accountTags.length && !(cur.accountTags || []).length) {
    next.accountTags = [...applicant.accountTags]
    profileChanged = true
  }

  if (profileChanged) profiles[pid] = next
  let memberChanged = profileChanged
  if (strEmpty(base.contact) && applicant.contact) {
    base.contact = String(applicant.contact).trim()
    memberChanged = true
  }
  if (strEmpty(base.wechatId) && applicant.wechatId) {
    base.wechatId = String(applicant.wechatId).trim()
    memberChanged = true
  }
  if (strEmpty(base.alipayAccount) && applicant.alipayAccount) {
    base.alipayAccount = String(applicant.alipayAccount).trim()
    memberChanged = true
  }
  if (strEmpty(base.province) && applicant.province) {
    base.province = String(applicant.province).trim()
    memberChanged = true
  }
  if (strEmpty(base.city) && applicant.city) {
    base.city = String(applicant.city).trim()
    memberChanged = true
  }
  if (!memberChanged) return member
  base.platformProfiles = profiles
  return talentPlatforms.migrateMember(base)
}

module.exports = {
  emptyApplyFields,
  emptySupplierApplyFields,
  supplierMemberSyncAvailable,
  applyFieldsFromSupplierMember,
  memberSyncAvailable,
  applyFieldsFromMember,
  enrichApplicantFromMember,
  persistApplicantToMemberProfile,
}
