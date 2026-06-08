import type { RegistryFile, RegistryMpTalentMember, RegistryMpTalentPlatformProfile } from './opsRegistryTypes.js'
import { allocateLingqiTalentId } from './lingqiIdentity.js'
import {
  collectMemberPlatformProfiles,
  memberHasResolvablePlatformInfo,
  type MemberWithPlatformProfiles,
} from './mpTalentPlatformProfileResolve.js'
import { normalizeRecruitmentPlatform } from './recruitmentInfoFilter.js'
import { upsertTalentLibraryFromApplicant } from './talentLibraryUpsert.js'
import { extractProfileLinkUrl } from './talentProfileLink.js'
import { upsertSupplierTeamLibraryFromMember } from './supplierTeamLibrarySync.js'

function profileToApplicant(
  platform: string,
  profile: RegistryMpTalentPlatformProfile,
  contact: string,
  wechatId: string,
  province: string,
  city: string,
) {
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
    province: String(province || '').trim() || undefined,
    city: String(city || '').trim() || undefined,
    appliedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  }
}

export function upsertMpTalentMember(
  data: RegistryFile,
  member: MemberWithPlatformProfiles,
): RegistryMpTalentMember {
  const list = [...(data.mpTalentMembers ?? [])]
  const openId = String(member.wxOpenId || '').trim()
  const memberId = String(member.id || '').trim()
  const lingqiId = String(member.lingqiTalentId || '').trim()
  const phoneKey = String(member.contact || member.wechatId || '')
    .replace(/\D/g, '')
    .slice(-11)
  const idx = list.findIndex((m) => {
    if (openId && String(m.wxOpenId || '').trim() === openId) return true
    if (memberId && String(m.id || '').trim() === memberId) return true
    if (lingqiId && String(m.lingqiTalentId || '').trim() === lingqiId) return true
    if (phoneKey.length >= 11) {
      const mp = String(m.contact || m.wechatId || '')
        .replace(/\D/g, '')
        .slice(-11)
      if (mp === phoneKey) return true
    }
    const k = String(m.wechatId || m.wxNickName || '').trim().toLowerCase()
    const wxKey = String(member.wechatId || member.wxNickName || '').trim().toLowerCase()
    return wxKey && !openId && k && k === wxKey
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

  const contact = next.contact
  const wechatId = next.wechatId
  const province = String(next.province || '').trim()
  const city = String(next.city || '').trim()
  const libOpts = {
    mpOrderId: '',
    merchantOrderNo: '',
    lingqiTalentId: next.lingqiTalentId,
  }
  for (const { platform, profile } of collectMemberPlatformProfiles(next)) {
    upsertTalentLibraryFromApplicant(data, {
      platform,
      applicant: profileToApplicant(platform, profile, contact, wechatId, province, city),
      ...libOpts,
    })
  }
  return upsertSupplierTeamLibraryFromMember(data, next)
}
