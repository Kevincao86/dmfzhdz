import type { RegistryMpTalentMember, RegistryMpTalentPlatformProfile } from './opsRegistryTypes.js'

const PLATFORM_SYNC = [
  { id: 'douyin', name: '抖音' },
  { id: 'xiaohongshu', name: '小红书' },
  { id: 'kuaishou', name: '快手' },
  { id: 'dianping', name: '大众点评' },
  { id: 'weixin_video', name: '微信视频号' },
] as const

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

export type MemberWithPlatformProfiles = RegistryMpTalentMember & {
  platformProfiles?: Record<string, LooseProfile>
  alipayAccount?: string
}

function parseFollowers(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, raw)
  const n = Number.parseInt(String(raw ?? '0').replace(/,/g, ''), 10)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function normalizeLooseProfile(
  raw: LooseProfile | undefined,
  memberAlipay: string,
): RegistryMpTalentPlatformProfile | null {
  if (!raw || raw.enabled === false) return null
  const account = String(raw.platformAccount || '').trim()
  if (!account) return null
  const alipay = String(raw.alipayAccount || memberAlipay || '').trim()
  return {
    platformAccount: account,
    platformNickname: String(raw.platformNickname || '').trim(),
    profileLink: String(raw.profileLink || '').trim(),
    followers: parseFollowers(raw.followers),
    douyinSalesLevel: raw.douyinSalesLevel ? String(raw.douyinSalesLevel).trim() : undefined,
    quotePrice: String(raw.quotePrice || '').trim(),
    alipayAccount: alipay,
    accountTags: Array.isArray(raw.accountTags) ? raw.accountTags.map(String) : undefined,
  }
}

/** 履约 Web / 小程序 platformProfiles 与旧版 douyin、xiaohongshu 字段统一解析 */
export function collectMemberPlatformProfiles(
  member: MemberWithPlatformProfiles,
): { platform: string; profile: RegistryMpTalentPlatformProfile }[] {
  const out: { platform: string; profile: RegistryMpTalentPlatformProfile }[] = []
  const memberAlipay = String(member.alipayAccount || '').trim()
  const pp = member.platformProfiles
  if (pp && typeof pp === 'object') {
    for (const { id, name } of PLATFORM_SYNC) {
      const prof = normalizeLooseProfile(pp[id], memberAlipay)
      if (prof) out.push({ platform: name, profile: prof })
    }
    if (out.length) return out
  }
  if (member.douyin?.platformAccount) {
    const prof = normalizeLooseProfile(member.douyin, memberAlipay)
    if (prof) out.push({ platform: '抖音', profile: prof })
  }
  if (member.xiaohongshu?.platformAccount) {
    const prof = normalizeLooseProfile(member.xiaohongshu, memberAlipay)
    if (prof) out.push({ platform: '小红书', profile: prof })
  }
  return out
}

export function memberHasResolvablePlatformInfo(member: MemberWithPlatformProfiles): boolean {
  return collectMemberPlatformProfiles(member).length > 0
}
