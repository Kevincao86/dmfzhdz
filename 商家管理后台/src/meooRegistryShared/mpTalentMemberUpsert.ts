import type { RegistryFile, RegistryMpTalentMember, RegistryMpTalentPlatformProfile } from './opsRegistryTypes.js'
import { allocateLingqiTalentId } from './lingqiIdentity.js'
import {
  collectMemberPlatformProfiles,
  memberHasResolvablePlatformInfo,
  type MemberWithPlatformProfiles,
} from './mpTalentPlatformProfileResolve.js'
import { normalizeRecruitmentPlatform } from './recruitmentInfoFilter.js'
import { collectTagsForPlatform } from './talentLibraryFilters.js'
import { upsertTalentLibraryFromApplicant } from './talentLibraryUpsert.js'
import { extractProfileLinkUrl } from './talentProfileLink.js'
import { upsertSupplierTeamLibraryFromMember } from './supplierTeamLibrarySync.js'

function profileToApplicant(
  platform: string,
  profile: RegistryMpTalentPlatformProfile,
  member: RegistryMpTalentMember,
) {
  const contact = String(member.contact || '').trim()
  const wechatId = String(member.wechatId || '').trim()
  const province = String(member.province || '').trim()
  const city = String(member.city || '').trim()
  const plat = normalizeRecruitmentPlatform(platform)
  const nick = String(profile.platformNickname || '').trim()
  const alipay = String(profile.alipayAccount || '').trim()
  return {
    id: `mbr-${Date.now()}`,
    name: nick,
    platform: plat,
    platformAccount: String(profile.platformAccount || '').trim(),
    platformNickname: nick,
    profileLink:
      extractProfileLinkUrl(profile.profileLink) || String(profile.profileLink || '').trim(),
    followers: Math.max(0, profile.followers || 0),
    douyinSalesLevel: plat === '抖音' ? profile.douyinSalesLevel : undefined,
    contact: String(contact || '').trim(),
    wechatId: String(wechatId || '').trim(),
    quotePrice: String(profile.quotePrice || '').trim(),
    alipayAccount: alipay,
    paymentMethod: alipay ? `支付宝：${alipay}` : '支付宝',
    province: province || undefined,
    city: city || undefined,
    gender: String(member.gender || '').trim() || undefined,
    accountTags: collectTagsForPlatform(member, plat),
    appliedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  }
}

export function upsertMpTalentMember(
  data: RegistryFile,
  member: MemberWithPlatformProfiles,
): RegistryMpTalentMember {
  const list = [...(data.mpTalentMembers ?? [])]
  const openId = String(member.wxOpenId || '').trim()
  const wxKey = openId || String(member.wechatId || member.wxNickName || '').trim().toLowerCase()
  const idx = list.findIndex((m) => {
    if (openId && String(m.wxOpenId || '').trim() === openId) return true
    const k = String(m.wechatId || m.wxNickName || '').trim().toLowerCase()
    return wxKey && !openId && k === wxKey
  })
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const prev = idx >= 0 ? list[idx]! : null
  let lingqiTalentId = prev?.lingqiTalentId || member.lingqiTalentId
  if (memberHasResolvablePlatformInfo(member) && !lingqiTalentId) {
    lingqiTalentId = allocateLingqiTalentId(data, lingqiTalentId)
  }
  const next: RegistryMpTalentMember = {
    ...member,
    id: prev?.id || member.id || `MTM-${Date.now()}`,
    lingqiTalentId: lingqiTalentId || prev?.lingqiTalentId,
    updatedAt: now,
    registeredAt: prev?.registeredAt || member.registeredAt || now,
  }
  if (idx >= 0) list[idx] = next
  else list.unshift(next)
  data.mpTalentMembers = list.slice(0, 5000)

  const libOpts = {
    mpOrderId: '',
    merchantOrderNo: '',
    lingqiTalentId: next.lingqiTalentId,
  }
  for (const { platform, profile } of collectMemberPlatformProfiles(next)) {
    upsertTalentLibraryFromApplicant(data, {
      platform,
      applicant: profileToApplicant(platform, profile, next),
      ...libOpts,
    })
  }
  return upsertSupplierTeamLibraryFromMember(data, next)
}
