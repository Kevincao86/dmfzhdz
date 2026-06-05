import { TALENT_TAGS } from './publishFormOptions'
import type { SupplierProfile } from './supplierTeamProfile'

export const TALENT_PLATFORMS = [
  { id: 'douyin', name: '抖音' },
  { id: 'xiaohongshu', name: '小红书' },
  { id: 'kuaishou', name: '快手' },
  { id: 'dianping', name: '大众点评' },
  { id: 'weixin_video', name: '微信视频号' },
] as const

const NAME_TO_ID: Record<string, string> = {
  抖音: 'douyin',
  小红书: 'xiaohongshu',
  快手: 'kuaishou',
  大众点评: 'dianping',
  微信视频号: 'weixin_video',
}

export type PlatformProfile = {
  enabled: boolean
  platformAccount: string
  platformNickname: string
  profileLink: string
  followers: string
  douyinSalesLevel: string
  talentGrade: string
  quotePrice: string
  accountTags: string[]
}

export function emptyProfile(): PlatformProfile {
  return {
    enabled: false,
    platformAccount: '',
    platformNickname: '',
    profileLink: '',
    followers: '',
    douyinSalesLevel: '',
    talentGrade: '',
    quotePrice: '',
    accountTags: [],
  }
}

export function emptyAllProfiles(): Record<string, PlatformProfile> {
  const out: Record<string, PlatformProfile> = {}
  for (const p of TALENT_PLATFORMS) out[p.id] = emptyProfile()
  return out
}

export function platformIdFromName(name: unknown): string {
  const s = String(name || '').trim()
  if (NAME_TO_ID[s]) return NAME_TO_ID[s]
  if (s.includes('红')) return 'xiaohongshu'
  if (s.includes('快手')) return 'kuaishou'
  if (s.includes('点评') || s.includes('大众')) return 'dianping'
  if (s.includes('视频号')) return 'weixin_video'
  return 'douyin'
}

export function profileFilled(prof: PlatformProfile | undefined) {
  if (!prof?.enabled) return false
  return Boolean(String(prof.platformAccount || '').trim() || String(prof.platformNickname || '').trim())
}

export function migrateMember(raw: Record<string, unknown> | null): TalentMember | null {
  if (!raw) return null
  const base = { ...raw } as TalentMember
  const profiles = emptyAllProfiles()
  if (base.platformProfiles && typeof base.platformProfiles === 'object') {
    for (const p of TALENT_PLATFORMS) {
      const src = (base.platformProfiles as Record<string, PlatformProfile>)[p.id]
      if (src) profiles[p.id] = { ...emptyProfile(), ...src, enabled: !!src.enabled }
    }
  }
  base.platformProfiles = profiles
  if (!base.alipayAccount && raw.douyin && typeof raw.douyin === 'object') {
    const d = raw.douyin as Record<string, unknown>
    if (d.alipayAccount) base.alipayAccount = String(d.alipayAccount)
  }
  return base
}

export type TalentMember = {
  id?: string
  lingqiTalentId?: string
  lingqiShootTeamId?: string
  lingqiEditTeamId?: string
  workIdentity?: string
  memberType?: string
  wxNickName?: string
  wxAvatarUrl?: string
  wxOpenId?: string
  contact?: string
  wechatId?: string
  alipayAccount?: string
  province?: string
  city?: string
  platformProfiles: Record<string, PlatformProfile>
  supplierProfile?: SupplierProfile
  accountTags?: string[]
  registeredAt?: string
  updatedAt?: string
}

export function inferLegacyMemberType(profiles: Record<string, PlatformProfile>) {
  const on = TALENT_PLATFORMS.filter((p) => profiles[p.id]?.enabled).map((p) => p.id)
  if (on.length >= 3) return 'multi'
  if (on.includes('douyin') && on.includes('xiaohongshu')) return 'both'
  if (on.includes('douyin')) return 'douyin'
  if (on.includes('xiaohongshu')) return 'xiaohongshu'
  return on[0] || 'douyin'
}

export function summaryLabel(member: TalentMember | null) {
  if (!member?.platformProfiles) return '未填写'
  const names = TALENT_PLATFORMS.filter((p) => profileFilled(member.platformProfiles[p.id])).map((p) => p.name)
  return names.length ? names.join('、') : '未填写'
}

export { TALENT_TAGS }
