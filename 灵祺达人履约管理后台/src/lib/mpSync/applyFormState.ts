import { DOUYIN_LEVELS } from './platformForm'
import { setupRegionState } from './regionPicker'
import { memberCoversPlatform, platformProfileFromMember, readMember } from './talentMember'

export function emptyApplyFields() {
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
    customFields: {} as Record<string, string>,
    ...setupRegionState('', ''),
  }
}

export function memberSyncAvailable(member: ReturnType<typeof readMember>, platform: string) {
  if (!member || !memberCoversPlatform(member, platform)) return false
  const prof = platformProfileFromMember(member, platform)
  if (!prof) return false
  return Boolean(String(prof.platformAccount || '').trim() || String(prof.platformNickname || '').trim())
}

export function applyFieldsFromMember(member: ReturnType<typeof readMember>, platform: string) {
  if (!memberSyncAvailable(member, platform)) return null
  const prof = platformProfileFromMember(member, platform)!
  const level = String(prof.douyinSalesLevel || '')
  let douyinLevelIndex = 0
  if (level) {
    const idx = DOUYIN_LEVELS.indexOf(level)
    if (idx >= 0) douyinLevelIndex = idx
  }
  return {
    platformAccount: prof.platformAccount || '',
    platformNickname: prof.platformNickname || '',
    profileLink: prof.profileLink || '',
    followers: prof.followers != null && prof.followers !== '' ? String(prof.followers) : '',
    douyinSalesLevel: level,
    douyinLevelIndex,
    contact: member!.contact || '',
    wechatId: member!.wechatId || '',
    quotePrice: prof.quotePrice || '',
    alipayAccount: member!.alipayAccount || '',
    visitDate: '',
    visitTimeStart: '',
    visitTimeEnd: '',
    ...setupRegionState(member!.province || '', member!.city || ''),
  }
}
