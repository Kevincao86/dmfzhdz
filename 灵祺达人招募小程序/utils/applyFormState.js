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
  if (!member || !memberStore.memberCoversPlatform(member, platform)) return false
  const prof = memberStore.platformProfileFromMember(member, platform)
  if (!prof) return false
  return Boolean(
    String(prof.platformAccount || '').trim() || String(prof.platformNickname || '').trim(),
  )
}

/** 从会员资料生成报名表单字段（不含探店时间） */
function applyFieldsFromMember(member, platform, douyinLevels) {
  if (!memberSyncAvailable(member, platform)) return null
  const prof = memberStore.platformProfileFromMember(member, platform)
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
    alipayAccount: prof.alipayAccount || '',
    visitDate: '',
    visitTimeStart: '',
    visitTimeEnd: '',
    ...region,
  }
}

module.exports = {
  emptyApplyFields,
  memberSyncAvailable,
  applyFieldsFromMember,
}
