import { DOUYIN_LEVELS } from './platformForm'
import { setupRegionState } from './regionPicker'
import {
  emptyAllProfiles,
  emptyProfile,
  migrateMember,
  platformIdFromName,
  type PlatformProfile,
  type TalentMember,
} from './talentPlatformProfiles'
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

function strEmpty(v: unknown) {
  return !String(v == null ? '' : v).trim()
}

/** 报名成功后：仅将「我的信息」中空缺项写回对应平台资料 */
export function persistApplicantToMemberProfile(
  member: TalentMember | null,
  applicant: Record<string, unknown>,
  platform: string,
): TalentMember | null {
  if (!applicant) return member
  const base: Record<string, unknown> = member
    ? { ...(member as unknown as Record<string, unknown>) }
    : { platformProfiles: emptyAllProfiles() }
  const profiles: Record<string, PlatformProfile> = {
    ...emptyAllProfiles(),
    ...((base.platformProfiles as Record<string, PlatformProfile>) || {}),
  }
  const pid = platformIdFromName(platform)
  const src = profiles[pid]
  const cur: PlatformProfile = { ...emptyProfile(), ...src, enabled: !!src?.enabled }
  const next = { ...cur, enabled: true }
  let profileChanged = false

  const fillProf = (key: keyof typeof next, val: unknown) => {
    if (strEmpty(cur[key]) && !strEmpty(val)) {
      ;(next as Record<string, unknown>)[key] = String(val).trim()
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

  let memberChanged = profileChanged
  if (profileChanged) profiles[pid] = next
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
  return migrateMember(base) as TalentMember
}
