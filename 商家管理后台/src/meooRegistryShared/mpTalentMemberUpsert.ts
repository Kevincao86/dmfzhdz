import type { RegistryFile, RegistryMpTalentMember, RegistryMpTalentPlatformProfile } from './opsRegistryTypes.js'
import { allocateLingqiTalentId, memberHasPlatformInfo } from './lingqiIdentity.js'
import { normalizeRecruitmentPlatform } from './recruitmentInfoFilter.js'
import { upsertTalentLibraryFromApplicant } from './talentLibraryUpsert.js'

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
    profileLink: String(profile.profileLink || '').trim(),
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

export function upsertMpTalentMember(data: RegistryFile, member: RegistryMpTalentMember): RegistryMpTalentMember {
  const list = [...(data.mpTalentMembers ?? [])]
  const wxKey = String(member.wxOpenId || member.wechatId || member.wxNickName || '')
    .trim()
    .toLowerCase()
  const idx = list.findIndex((m) => {
    const k = String(m.wxOpenId || m.wechatId || m.wxNickName || '')
      .trim()
      .toLowerCase()
    return wxKey && k === wxKey
  })
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const prev = idx >= 0 ? list[idx]! : null
  let lingqiTalentId = prev?.lingqiTalentId || member.lingqiTalentId
  if (memberHasPlatformInfo(member) && !lingqiTalentId) {
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
  if (next.douyin?.platformAccount) {
    upsertTalentLibraryFromApplicant(data, {
      platform: '抖音',
      applicant: profileToApplicant('抖音', next.douyin, contact, wechatId, province, city),
      ...libOpts,
    })
  }
  if (next.xiaohongshu?.platformAccount) {
    upsertTalentLibraryFromApplicant(data, {
      platform: '小红书',
      applicant: profileToApplicant('小红书', next.xiaohongshu, contact, wechatId, province, city),
      ...libOpts,
    })
  }
  return next
}
