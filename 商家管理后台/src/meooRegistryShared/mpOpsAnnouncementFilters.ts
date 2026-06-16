/** 运营台达人小程序公告 — 客户端筛选预览（与 mpOpsAnnouncementCore 逻辑一致） */
import type { RegistryMpTalentMember } from './opsRegistryTypes.js'
import {
  TALENT_DOUYIN_LEVEL_OPTS,
  TALENT_FOLLOWER_TIER_OPTS,
  followerMatchesTier,
  normalizeDouyinLevel,
} from './talentLibraryFilters.js'
import { collectMemberPlatformProfiles } from './mpTalentPlatformProfileResolve.js'

export type MpOpsAnnouncementTargetFilter = {
  provinces?: string[]
  cities?: string[]
  platforms?: string[]
  douyinSalesLevels?: string[]
  followerTiers?: string[]
  selectedMemberIds?: string[]
}

export { TALENT_DOUYIN_LEVEL_OPTS, TALENT_FOLLOWER_TIER_OPTS }

export function matchMpTalentMemberForAnnouncement(
  member: RegistryMpTalentMember,
  filter: MpOpsAnnouncementTargetFilter,
): boolean {
  if (!member?.id) return false
  const w = String(member.workIdentity || 'talent').trim()
  if (w && w !== 'talent') return false

  const provinces = (filter.provinces || []).map((x) => String(x).trim()).filter(Boolean)
  const cities = (filter.cities || []).map((x) => String(x).trim()).filter(Boolean)
  const platforms = (filter.platforms || []).map((x) => String(x).trim()).filter(Boolean)
  const levels = (filter.douyinSalesLevels || []).map((x) => normalizeDouyinLevel(x)).filter(Boolean)
  const tiers = (filter.followerTiers || []).map((x) => String(x).trim()).filter(Boolean)

  const province = String(member.province || '').trim()
  const city = String(member.city || '').trim()
  if (provinces.length && !provinces.includes(province)) return false
  if (cities.length && !cities.includes(city)) return false

  const profiles = collectMemberPlatformProfiles(member)
  if (!profiles.length) return false
  const scoped =
    platforms.length > 0 ? profiles.filter((p) => platforms.includes(p.platform)) : profiles
  if (!scoped.length) return false

  if (levels.length) {
    const douyin = scoped.find((p) => p.platform === '抖音')
    if (!douyin) return false
    const lv = normalizeDouyinLevel(String(douyin.profile.douyinSalesLevel || ''))
    if (!levels.some((x) => normalizeDouyinLevel(x) === lv)) return false
  }

  if (tiers.length) {
    const followersList = scoped.map((p) => Number(p.profile.followers) || 0)
    if (!followersList.some((n) => tiers.some((tier) => followerMatchesTier(n, tier)))) return false
  }

  return true
}

export function previewMpAnnouncementRecipients(
  members: RegistryMpTalentMember[],
  filter: MpOpsAnnouncementTargetFilter,
): RegistryMpTalentMember[] {
  const matched = members.filter((m) => matchMpTalentMemberForAnnouncement(m, filter))
  const selected = [...new Set((filter.selectedMemberIds || []).map((id) => String(id).trim()).filter(Boolean))]
  if (selected.length) {
    const set = new Set(selected)
    return matched.filter((m) => set.has(m.id))
  }
  return matched
}

export function memberDisplayLabel(member: RegistryMpTalentMember): string {
  const profiles = collectMemberPlatformProfiles(member)
  const main = profiles[0]
  const nick = main?.profile.platformNickname || main?.profile.platformAccount || member.contact
  const lq = String(member.lingqiTalentId || '').trim()
  const region = [member.province, member.city].filter(Boolean).join(' ')
  return [nick, lq, region].filter(Boolean).join(' · ')
}
