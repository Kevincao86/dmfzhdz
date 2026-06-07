import type { MpAccountRow } from './mpAccountAuth.js'
import type {
  RegistryFile,
  RegistryMpTalentMember,
  RegistryTalentLibraryEntry,
} from './opsRegistryTypes.js'
import {
  collectMemberPlatformProfiles,
  memberHasResolvablePlatformInfo,
  type MemberWithPlatformProfiles,
} from './mpTalentPlatformProfileResolve.js'
import { normalizeRecruitmentPlatform, type RecruitmentPlatform } from './recruitmentInfoFilter.js'

const PLATFORM_NAME_TO_ID: Record<RecruitmentPlatform, string> = {
  抖音: 'douyin',
  小红书: 'xiaohongshu',
  快手: 'kuaishou',
  大众点评: 'dianping',
  微信视频号: 'weixin_video',
}

type LooseProfile = {
  enabled?: boolean
  platformAccount?: string
  platformNickname?: string
  profileLink?: string
  followers?: number | string
  douyinSalesLevel?: string
  quotePrice?: string
  alipayAccount?: string
  accountTags?: string[]
}

function accountPhoneKey(account: MpAccountRow): string {
  return String(account.login_name || '')
    .replace(/\D/g, '')
    .slice(-11)
}

function memberPhoneKey(m: RegistryMpTalentMember): string {
  return String(m.contact || m.wechatId || '')
    .replace(/\D/g, '')
    .slice(-11)
}

function libraryEntryPhoneKey(e: RegistryTalentLibraryEntry): string {
  return String(e.contact || e.wechatId || '')
    .replace(/\D/g, '')
    .slice(-11)
}

function profileRichness(raw: LooseProfile | undefined): number {
  if (!raw) return 0
  let score = 0
  if (String(raw.platformAccount || '').trim()) score += 20
  if (String(raw.platformNickname || '').trim()) score += 10
  if (String(raw.profileLink || '').trim()) score += 5
  const followers = Number.parseInt(String(raw.followers ?? '0').replace(/,/g, ''), 10)
  if (Number.isFinite(followers) && followers > 0) score += 8
  if (String(raw.douyinSalesLevel || '').trim()) score += 3
  if (String(raw.quotePrice || '').trim()) score += 2
  return score
}

function pickRicherProfile(
  current: LooseProfile | undefined,
  candidate: LooseProfile | undefined,
): LooseProfile | undefined {
  if (!candidate) return current
  const account = String(candidate.platformAccount || '').trim()
  const nick = String(candidate.platformNickname || '').trim()
  if (!account && !nick) return current
  const next: LooseProfile = { ...candidate, enabled: true }
  if (!current) return next
  return profileRichness(next) > profileRichness(current) ? next : current
}

function assignRicherProfile(
  map: Record<string, LooseProfile>,
  id: string,
  candidate: LooseProfile | undefined,
): void {
  const merged = pickRicherProfile(map[id], candidate)
  if (merged) map[id] = merged
}

function memberProfilesToLooseMap(member: MemberWithPlatformProfiles): Record<string, LooseProfile> {
  const out: Record<string, LooseProfile> = {}
  const pp = member.platformProfiles
  if (pp && typeof pp === 'object') {
    for (const [id, prof] of Object.entries(pp)) {
      if (prof && typeof prof === 'object') out[id] = { ...prof, enabled: prof.enabled !== false }
    }
  }
  if (member.douyin) {
    assignRicherProfile(out, 'douyin', { ...member.douyin, enabled: true })
  }
  if (member.xiaohongshu) {
    assignRicherProfile(out, 'xiaohongshu', { ...member.xiaohongshu, enabled: true })
  }
  return out
}

function libraryEntryToLooseProfile(e: RegistryTalentLibraryEntry): LooseProfile {
  return {
    enabled: true,
    platformAccount: String(e.platformAccount || '').trim(),
    platformNickname: String(e.platformNickname || '').trim(),
    profileLink: String(e.profileLink || '').trim(),
    followers: Math.max(0, e.followers || 0),
    douyinSalesLevel: e.douyinSalesLevel ? String(e.douyinSalesLevel).trim() : undefined,
    quotePrice: String(e.quotePrice || '').trim(),
    alipayAccount: e.alipayAccount ? String(e.alipayAccount).trim() : undefined,
  }
}

/** 灵祺达人库 + 同手机号其他注册会员 → 可回填的平台资料 */
export function findTalentLibraryEntriesForAccount(
  data: RegistryFile,
  account: MpAccountRow,
  member: RegistryMpTalentMember | null,
): RegistryTalentLibraryEntry[] {
  const phone = accountPhoneKey(account)
  const talentId = String(account.lingqi_talent_id || member?.lingqiTalentId || '').trim()
  const entries = data.talentLibraryEntries ?? []
  return entries.filter((e) => {
    const entryPhone = libraryEntryPhoneKey(e)
    const entryTalent = String(e.lingqiTalentId || '').trim()
    if (phone.length >= 11 && entryPhone === phone) return true
    if (talentId && entryTalent === talentId) return true
    return false
  })
}

function findSiblingMembersWithPlatformData(
  data: RegistryFile,
  account: MpAccountRow,
  primary: RegistryMpTalentMember,
): RegistryMpTalentMember[] {
  const phone = accountPhoneKey(account)
  if (phone.length < 11) return []
  const members = data.mpTalentMembers ?? []
  return members.filter((m) => {
    if (m.id === primary.id) return false
    if (memberPhoneKey(m) !== phone) return false
    return memberHasResolvablePlatformInfo(m as MemberWithPlatformProfiles)
  })
}

function mergeScalarFields(
  base: RegistryMpTalentMember,
  donor: RegistryMpTalentMember | RegistryTalentLibraryEntry,
): RegistryMpTalentMember {
  const next = { ...base }
  const donorNick =
    'wxNickName' in donor
      ? String(donor.wxNickName || '').trim()
      : String(donor.platformNickname || '').trim()
  if (!String(next.wxNickName || '').trim() && donorNick) next.wxNickName = donorNick
  if (!String(next.alipayAccount || '').trim() && 'alipayAccount' in donor && donor.alipayAccount) {
    next.alipayAccount = String(donor.alipayAccount).trim()
  }
  if (!String(next.province || '').trim() && donor.province) next.province = String(donor.province).trim()
  if (!String(next.city || '').trim() && donor.city) next.city = String(donor.city).trim()
  if (!String(next.contact || '').trim() && 'contact' in donor) {
    next.contact = String(donor.contact || '').trim()
  }
  if (!String(next.wechatId || '').trim() && 'wechatId' in donor) {
    next.wechatId = String(donor.wechatId || '').trim()
  }
  return next
}

/**
 * 将运营台「灵祺达人库」与同手机号会员的平台资料合并到当前登录绑定的 mpTalentMember。
 * 解决 LQ-D-000009 空壳、资料落在 LQ-D-000001 / talentLibraryEntries 的情况。
 */
export function enrichMemberFromRegistrySources(
  data: RegistryFile,
  account: MpAccountRow,
  member: RegistryMpTalentMember | null,
): RegistryMpTalentMember | null {
  const phone = accountPhoneKey(account)
  const accTalentId = String(account.lingqi_talent_id || '').trim()
  const memberId = String(account.registry_member_id || '').trim()
  const libEntries = findTalentLibraryEntriesForAccount(data, account, member)
  const siblings = member ? findSiblingMembersWithPlatformData(data, account, member) : []

  if (!member && libEntries.length === 0 && siblings.length === 0) return null

  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  let base: RegistryMpTalentMember =
    member ??
    ({
      id: memberId || `MTM-${Date.now()}`,
      lingqiTalentId: accTalentId || undefined,
      contact: phone || '',
      wechatId: phone || '',
      wxNickName: '',
      wxAvatarUrl: '',
      memberType: 'douyin',
      registeredAt: now,
      updatedAt: now,
    } as RegistryMpTalentMember)

  if (memberId) base = { ...base, id: memberId }
  if (accTalentId) base = { ...base, lingqiTalentId: accTalentId }
  if (phone.length >= 11) {
    if (!String(base.contact || '').trim()) base = { ...base, contact: phone }
    if (!String(base.wechatId || '').trim()) base = { ...base, wechatId: phone }
  }

  let platformProfiles = memberProfilesToLooseMap(base as MemberWithPlatformProfiles)

  for (const sib of siblings) {
    base = mergeScalarFields(base, sib)
    const sibProfiles = memberProfilesToLooseMap(sib as MemberWithPlatformProfiles)
    for (const [id, prof] of Object.entries(sibProfiles)) {
      assignRicherProfile(platformProfiles, id, prof)
    }
  }

  for (const entry of libEntries) {
    base = mergeScalarFields(base, entry)
    const platId = PLATFORM_NAME_TO_ID[normalizeRecruitmentPlatform(entry.platform)]
    const loose = libraryEntryToLooseProfile(entry)
    assignRicherProfile(platformProfiles, platId, loose)
  }

  const hasPlatforms =
    Object.keys(platformProfiles).length > 0 ||
    collectMemberPlatformProfiles({ ...base, platformProfiles } as MemberWithPlatformProfiles).length > 0

  if (!hasPlatforms && !member) return null

  return {
    ...base,
    platformProfiles: platformProfiles as RegistryMpTalentMember['platformProfiles'],
    updatedAt: base.updatedAt || now,
  }
}
