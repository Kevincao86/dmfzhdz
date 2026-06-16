/** 运营台达人小程序公告 — 可推送达人判定（对齐达人库，排除空白 stub） */
import type {
  RegistryMpTalentMember,
  RegistryMpTalentPlatformProfile,
  RegistryTalentLibraryEntry,
} from './opsRegistryTypes.js'
import { collectMemberPlatformProfiles } from './mpTalentPlatformProfileResolve.js'
import {
  findMemberForLibraryEntry,
  followerMatchesTier,
  normalizeDouyinLevel,
} from './talentLibraryFilters.js'

export type MpOpsAnnouncementTargetFilter = {
  provinces?: string[]
  cities?: string[]
  platforms?: string[]
  douyinSalesLevels?: string[]
  followerTiers?: string[]
  selectedMemberIds?: string[]
}

function memberPhoneKey(member: RegistryMpTalentMember): string {
  return String(member.contact || '')
    .replace(/\D/g, '')
    .slice(-11)
}

function isTalentMember(member: RegistryMpTalentMember): boolean {
  const w = String(member.workIdentity || 'talent').trim()
  return w === 'talent' || w === ''
}

function validLibraryEntry(entry: RegistryTalentLibraryEntry): boolean {
  return Boolean(String(entry.platformAccount || '').trim())
}

export function findMemberForAnnouncementLibraryEntry(
  entry: RegistryTalentLibraryEntry,
  members: RegistryMpTalentMember[],
): RegistryMpTalentMember | null {
  if (!validLibraryEntry(entry)) return null
  const fromLib = findMemberForLibraryEntry(entry, members)
  if (fromLib) return fromLib
  const ec = memberPhoneKey({ contact: entry.contact } as RegistryMpTalentMember)
  if (ec.length >= 11) {
    const hit = members.find((m) => memberPhoneKey(m) === ec)
    if (hit) return hit
  }
  const lq = String(entry.lingqiTalentId || '').trim()
  if (lq) {
    const hit = members.find((m) => String(m.lingqiTalentId || '').trim() === lq)
    if (hit) return hit
  }
  return null
}

export function libraryEntriesForMember(
  member: RegistryMpTalentMember,
  libraryEntries: RegistryTalentLibraryEntry[],
  members: RegistryMpTalentMember[],
): RegistryTalentLibraryEntry[] {
  const id = String(member.id || '').trim()
  if (!id) return []
  return libraryEntries.filter((entry) => {
    if (!validLibraryEntry(entry)) return false
    const linked = findMemberForAnnouncementLibraryEntry(entry, members)
    return linked?.id === id
  })
}

export function collectAnnouncementProfiles(
  member: RegistryMpTalentMember,
  libraryEntries: RegistryTalentLibraryEntry[],
  members: RegistryMpTalentMember[],
): { platform: string; profile: RegistryMpTalentPlatformProfile }[] {
  const fromMember = collectMemberPlatformProfiles(member)
  if (fromMember.length) return fromMember
  return libraryEntriesForMember(member, libraryEntries, members).map((entry) => ({
    platform: entry.platform,
    profile: {
      platformAccount: String(entry.platformAccount || '').trim(),
      platformNickname: String(entry.platformNickname || '').trim(),
      profileLink: String(entry.profileLink || '').trim(),
      followers: Math.max(0, Number(entry.followers) || 0),
      douyinSalesLevel: entry.douyinSalesLevel ? String(entry.douyinSalesLevel).trim() : undefined,
      quotePrice: String(entry.quotePrice || '').trim(),
      alipayAccount: String(entry.alipayAccount || '').trim(),
      accountTags: Array.isArray(entry.accountTags) ? entry.accountTags : undefined,
    },
  }))
}

export function memberAnnouncementDisplayLabel(
  member: RegistryMpTalentMember,
  libraryEntries: RegistryTalentLibraryEntry[],
  members: RegistryMpTalentMember[],
): string {
  const profiles = collectAnnouncementProfiles(member, libraryEntries, members)
  const linked = libraryEntriesForMember(member, libraryEntries, members)
  const main = profiles[0]
  const lib = linked[0]
  const nick =
    main?.profile.platformNickname ||
    main?.profile.platformAccount ||
    lib?.platformNickname ||
    lib?.platformAccount ||
    String(member.wxNickName || '').trim() ||
    String(member.contact || '').trim()
  const lq = String(member.lingqiTalentId || lib?.lingqiTalentId || '').trim()
  const region = [member.province || lib?.province, member.city || lib?.city].filter(Boolean).join(' ')
  return [nick, lq, region].filter(Boolean).join(' · ')
}

export function isAnnounceableMpTalentMember(
  member: RegistryMpTalentMember,
  libraryEntries: RegistryTalentLibraryEntry[],
  members: RegistryMpTalentMember[],
): boolean {
  const id = String(member?.id || '').trim()
  if (!id || !isTalentMember(member)) return false

  const linked = libraryEntriesForMember(member, libraryEntries, members)
  const memberProfiles = collectMemberPlatformProfiles(member)
  if (!linked.length && !memberProfiles.length) return false

  const openId = String(member.wxOpenId || '').trim()
  const phone = memberPhoneKey(member)
  if (!openId && phone.length < 11) return false

  return Boolean(memberAnnouncementDisplayLabel(member, libraryEntries, members))
}

export function buildAnnounceableMpTalentMemberPool(
  members: RegistryMpTalentMember[],
  libraryEntries: RegistryTalentLibraryEntry[],
): RegistryMpTalentMember[] {
  const talentMembers = members.filter(isTalentMember)
  return talentMembers.filter((m) => isAnnounceableMpTalentMember(m, libraryEntries, talentMembers))
}

export function countValidTalentLibraryEntries(libraryEntries: RegistryTalentLibraryEntry[]): number {
  return libraryEntries.filter(validLibraryEntry).length
}

export function matchMpTalentMemberForAnnouncement(
  member: RegistryMpTalentMember,
  filter: MpOpsAnnouncementTargetFilter,
  libraryEntries: RegistryTalentLibraryEntry[],
  members: RegistryMpTalentMember[],
): boolean {
  if (!isAnnounceableMpTalentMember(member, libraryEntries, members)) return false

  const provinces = (filter.provinces || []).map((x) => String(x).trim()).filter(Boolean)
  const cities = (filter.cities || []).map((x) => String(x).trim()).filter(Boolean)
  const platforms = (filter.platforms || []).map((x) => String(x).trim()).filter(Boolean)
  const levels = (filter.douyinSalesLevels || []).map((x) => normalizeDouyinLevel(x)).filter(Boolean)
  const tiers = (filter.followerTiers || []).map((x) => String(x).trim()).filter(Boolean)

  const linked = libraryEntriesForMember(member, libraryEntries, members)
  const lib = linked[0]
  const province = String(member.province || lib?.province || '').trim()
  const city = String(member.city || lib?.city || '').trim()
  if (provinces.length && !provinces.includes(province)) return false
  if (cities.length && !cities.includes(city)) return false

  const profiles = collectAnnouncementProfiles(member, libraryEntries, members)
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
  libraryEntries: RegistryTalentLibraryEntry[] = [],
): RegistryMpTalentMember[] {
  const pool = buildAnnounceableMpTalentMemberPool(members, libraryEntries)
  const matched = pool.filter((m) => matchMpTalentMemberForAnnouncement(m, filter, libraryEntries, pool))
  const selected = [...new Set((filter.selectedMemberIds || []).map((id) => String(id).trim()).filter(Boolean))]
  if (selected.length) {
    const set = new Set(selected)
    return matched.filter((m) => set.has(m.id))
  }
  return matched
}
