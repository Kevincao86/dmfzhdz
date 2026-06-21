import type { RegistryMpPrUser, RegistryMpTalentMember, RegistryMpTalentPlatformProfile } from './opsRegistryTypes.js'

const PLATFORM_IDS = ['douyin', 'xiaohongshu', 'kuaishou', 'dianping', 'weixin_video'] as const

function followersStr(raw: unknown): string {
  if (raw == null || raw === '') return ''
  return String(raw)
}

function mapPlatformProfile(
  raw: (RegistryMpTalentPlatformProfile & { enabled?: boolean }) | undefined,
  _memberAlipay: string,
): Record<string, unknown> | null {
  if (!raw) return null
  const account = String(raw.platformAccount || '').trim()
  const nick = String(raw.platformNickname || '').trim()
  const enabled = raw.enabled !== false && !!(account || nick)
  if (!enabled) return null
  return {
    enabled: true,
    platformAccount: account,
    platformNickname: nick,
    profileLink: String(raw.profileLink || '').trim(),
    followers: followersStr(raw.followers),
    douyinSalesLevel: String(raw.douyinSalesLevel || '').trim(),
    talentGrade: String((raw as { talentGrade?: string }).talentGrade || '').trim(),
    quotePrice: String(raw.quotePrice || '').trim(),
    accountTags: Array.isArray(raw.accountTags) ? raw.accountTags.map(String) : [],
  }
}

/** 注册表达人会员 → 履约 Web / 小程序本地 TalentMember 草稿 */
export function registryMemberToClientDraft(member: RegistryMpTalentMember): Record<string, unknown> {
  const memberAlipay = String(member.alipayAccount || '').trim()
  const platformProfiles: Record<string, unknown> = {}
  for (const id of PLATFORM_IDS) {
    const legacy =
      id === 'douyin' ? member.douyin : id === 'xiaohongshu' ? member.xiaohongshu : undefined
    const src = member.platformProfiles?.[id] || legacy
    const mapped = mapPlatformProfile(src as RegistryMpTalentPlatformProfile & { enabled?: boolean }, memberAlipay)
    if (mapped) platformProfiles[id] = mapped
  }
  return {
    id: member.id,
    lingqiTalentId: member.lingqiTalentId || '',
    lingqiShootTeamId: member.lingqiShootTeamId || '',
    lingqiEditTeamId: member.lingqiEditTeamId || '',
    workIdentity: member.workIdentity || 'talent',
    memberType: member.memberType,
    wxNickName: member.wxNickName || '',
    wxAvatarUrl: member.wxAvatarUrl || '',
    wxOpenId: member.wxOpenId || '',
    contact: member.contact || '',
    wechatId: member.wechatId || '',
    alipayAccount: memberAlipay,
    gender: String(member.gender || '').trim(),
    province: member.province || '',
    city: member.city || '',
    accountTags: member.accountTags || [],
    supplierProfile: member.supplierProfile || undefined,
    platformProfiles,
    prExclusiveQuotes: Array.isArray(member.prExclusiveQuotes) ? member.prExclusiveQuotes : [],
    platformReferenceQuotes: Array.isArray(member.platformReferenceQuotes)
      ? member.platformReferenceQuotes
      : [],
    registeredAt: member.registeredAt,
    updatedAt: member.updatedAt,
  }
}

/** 注册表 PR 用户 → 履约 Web / 小程序 PrProfile 草稿 */
export function registryPrToClientDraft(pr: RegistryMpPrUser): Record<string, unknown> {
  return {
    id: pr.id,
    lingqiPrId: pr.lingqiPrId || '',
    accountType: pr.accountType === 'personal' ? 'personal' : 'company',
    companyName: pr.companyName || '',
    personalName: pr.personalName || '',
    contactName: pr.contactName || '',
    contactPhone: pr.contactPhone || '',
    wechatId: pr.wechatId || '',
    province: pr.province || '',
    city: pr.city || '',
    intro: pr.intro || '',
    wxNickName: pr.wxNickName || '',
    wxAvatarUrl: pr.wxAvatarUrl || '',
    wxOpenId: pr.wxOpenId || '',
    platformAccount: pr.platformAccount || pr.wxOpenId || '',
    sourceChannel: pr.sourceChannel,
    registeredAt: pr.registeredAt,
    updatedAt: pr.updatedAt,
    prFeatureAccess: pr.prFeatureAccess,
  }
}
