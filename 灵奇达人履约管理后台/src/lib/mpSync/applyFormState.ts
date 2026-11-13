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
import { normalizeSupplierProfile } from './supplierTeamProfile'

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

/** 拍摄 / 剪辑团队报名表单空白初始值 */
export function emptySupplierApplyFields() {
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
    customFields: {} as Record<string, string>,
    ...setupRegionState('', ''),
  }
}

export function supplierMemberSyncAvailable(member: ReturnType<typeof readMember>, workId: string) {
  if (!member || (workId !== 'shoot' && workId !== 'edit')) return false
  const p = normalizeSupplierProfile(member.supplierProfile)
  return Boolean(String(p.teamName || '').trim() && String(member.contact || '').trim())
}

export function applyFieldsFromSupplierMember(member: ReturnType<typeof readMember>, workId: string) {
  if (!supplierMemberSyncAvailable(member, workId)) return null
  const p = normalizeSupplierProfile(member!.supplierProfile)
  const region = setupRegionState(member!.province || '', member!.city || '')
  const base = {
    teamName: p.teamName || member!.wxNickName || '',
    contact: member!.contact || '',
    wechatId: member!.wechatId || '',
    portfolioLink: p.portfolioLink || '',
    quotePrice: String(p.perClipQuote || p.fullDayQuote || p.halfDayQuote || '').trim(),
    alipayAccount: member!.alipayAccount || '',
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

/** 提交前兜底：团队报名缺名称时用团队资料补全 */
export function enrichApplicantFromMember(
  applicant: Record<string, unknown>,
  member: ReturnType<typeof readMember>,
  platform: string,
  options?: { isSupplierApply?: boolean; workId?: string },
) {
  if (!applicant || !member) return applicant
  if (options?.isSupplierApply && (options.workId === 'shoot' || options.workId === 'edit')) {
    const fields = applyFieldsFromSupplierMember(member, options.workId)
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
  const fields = applyFieldsFromMember(member, platform)
  if (!fields) return applicant
  const next = { ...applicant }
  if (!String(next.platformNickname || next.name || '').trim()) {
    next.platformNickname = fields.platformNickname || ''
    next.name = next.platformNickname
  }
  if (!String(next.platformAccount || '').trim()) next.platformAccount = fields.platformAccount || ''
  if (!String(next.profileLink || '').trim()) next.profileLink = fields.profileLink || ''
  if (!String(next.contact || '').trim()) next.contact = fields.contact || ''
  if (!String(next.wechatId || '').trim()) next.wechatId = fields.wechatId || ''
  if (!String(next.province || '').trim()) next.province = fields.province || ''
  if (!String(next.city || '').trim()) next.city = fields.city || ''
  return next
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
