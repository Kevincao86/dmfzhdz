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

export type MpAnnouncementMemberContext = {
  talentMembers: RegistryMpTalentMember[]
  announceableMembers: RegistryMpTalentMember[]
  announceableMemberIds: Set<string>
  linkedEntriesByMemberId: Map<string, RegistryTalentLibraryEntry[]>
  profilesByMemberId: Map<string, { platform: string; profile: RegistryMpTalentPlatformProfile }[]>
  displayLabelByMemberId: Map<string, string>
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

function libraryEntryToProfile(entry: RegistryTalentLibraryEntry): RegistryMpTalentPlatformProfile {
  return {
    platformAccount: String(entry.platformAccount || '').trim(),
    platformNickname: String(entry.platformNickname || '').trim(),
    profileLink: String(entry.profileLink || '').trim(),
    followers: Math.max(0, Number(entry.followers) || 0),
    douyinSalesLevel: entry.douyinSalesLevel ? String(entry.douyinSalesLevel).trim() : undefined,
    quotePrice: String(entry.quotePrice || '').trim(),
    alipayAccount: String(entry.alipayAccount || '').trim(),
    accountTags: Array.isArray(entry.accountTags) ? entry.accountTags : undefined,
  }
}

function profilesFromLinkedEntries(
  linked: RegistryTalentLibraryEntry[],
): { platform: string; profile: RegistryMpTalentPlatformProfile }[] {
  return linked.map((entry) => ({
    platform: entry.platform,
    profile: libraryEntryToProfile(entry),
  }))
}

function buildDisplayLabel(
  member: RegistryMpTalentMember,
  profiles: { platform: string; profile: RegistryMpTalentPlatformProfile }[],
  linked: RegistryTalentLibraryEntry[],
): string {
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

/** 一次遍历达人库，预建 memberId → 库条目 / 平台资料 / 展示名，避免筛选时 O(n×m) 重复扫描 */
export function buildMpAnnouncementMemberContext(
  members: RegistryMpTalentMember[],
  libraryEntries: RegistryTalentLibraryEntry[],
): MpAnnouncementMemberContext {
  const talentMembers = members.filter(isTalentMember)
  const linkedEntriesByMemberId = new Map<string, RegistryTalentLibraryEntry[]>()

  for (const entry of libraryEntries) {
    if (!validLibraryEntry(entry)) continue
    const linked = findMemberForAnnouncementLibraryEntry(entry, talentMembers)
    const id = String(linked?.id || '').trim()
    if (!id) continue
    const bucket = linkedEntriesByMemberId.get(id)
    if (bucket) bucket.push(entry)
    else linkedEntriesByMemberId.set(id, [entry])
  }

  const profilesByMemberId = new Map<
    string,
    { platform: string; profile: RegistryMpTalentPlatformProfile }[]
  >()
  const displayLabelByMemberId = new Map<string, string>()
  const announceableMembers: RegistryMpTalentMember[] = []
  const announceableMemberIds = new Set<string>()

  for (const member of talentMembers) {
    const id = String(member.id || '').trim()
    if (!id) continue

    const linked = linkedEntriesByMemberId.get(id) ?? []
    const fromMember = collectMemberPlatformProfiles(member)
    const profiles = fromMember.length ? fromMember : profilesFromLinkedEntries(linked)
    profilesByMemberId.set(id, profiles)

    if (!linked.length && !fromMember.length) continue
    const openId = String(member.wxOpenId || '').trim()
    const phone = memberPhoneKey(member)
    if (!openId && phone.length < 11) continue

    const label = buildDisplayLabel(member, profiles, linked)
    if (!label) continue

    displayLabelByMemberId.set(id, label)
    announceableMemberIds.add(id)
    announceableMembers.push(member)
  }

  return {
    talentMembers,
    announceableMembers,
    announceableMemberIds,
    linkedEntriesByMemberId,
    profilesByMemberId,
    displayLabelByMemberId,
  }
}

export function libraryEntriesForMember(
  member: RegistryMpTalentMember,
  libraryEntries: RegistryTalentLibraryEntry[],
  members: RegistryMpTalentMember[],
  ctx?: MpAnnouncementMemberContext,
): RegistryTalentLibraryEntry[] {
  const id = String(member.id || '').trim()
  if (!id) return []
  if (ctx) return [...(ctx.linkedEntriesByMemberId.get(id) ?? [])]
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
  ctx?: MpAnnouncementMemberContext,
): { platform: string; profile: RegistryMpTalentPlatformProfile }[] {
  const id = String(member.id || '').trim()
  if (ctx && id) {
    const cached = ctx.profilesByMemberId.get(id)
    if (cached) return cached
  }
  const fromMember = collectMemberPlatformProfiles(member)
  if (fromMember.length) return fromMember
  return profilesFromLinkedEntries(libraryEntriesForMember(member, libraryEntries, members, ctx))
}

export function memberAnnouncementDisplayLabel(
  member: RegistryMpTalentMember,
  libraryEntries: RegistryTalentLibraryEntry[],
  members: RegistryMpTalentMember[],
  ctx?: MpAnnouncementMemberContext,
): string {
  const id = String(member.id || '').trim()
  if (ctx && id) {
    const cached = ctx.displayLabelByMemberId.get(id)
    if (cached) return cached
  }
  const profiles = collectAnnouncementProfiles(member, libraryEntries, members, ctx)
  const linked = libraryEntriesForMember(member, libraryEntries, members, ctx)
  return buildDisplayLabel(member, profiles, linked)
}

export function isAnnounceableMpTalentMember(
  member: RegistryMpTalentMember,
  libraryEntries: RegistryTalentLibraryEntry[],
  members: RegistryMpTalentMember[],
  ctx?: MpAnnouncementMemberContext,
): boolean {
  const id = String(member?.id || '').trim()
  if (!id || !isTalentMember(member)) return false
  if (ctx) return ctx.announceableMemberIds.has(id)

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
  ctx?: MpAnnouncementMemberContext,
): RegistryMpTalentMember[] {
  if (ctx) return ctx.announceableMembers
  return buildMpAnnouncementMemberContext(members, libraryEntries).announceableMembers
}

export function countValidTalentLibraryEntries(libraryEntries: RegistryTalentLibraryEntry[]): number {
  return libraryEntries.filter(validLibraryEntry).length
}

export function matchMpTalentMemberForAnnouncement(
  member: RegistryMpTalentMember,
  filter: MpOpsAnnouncementTargetFilter,
  libraryEntries: RegistryTalentLibraryEntry[],
  members: RegistryMpTalentMember[],
  ctx?: MpAnnouncementMemberContext,
): boolean {
  if (!isAnnounceableMpTalentMember(member, libraryEntries, members, ctx)) return false

  const provinces = (filter.provinces || []).map((x) => String(x).trim()).filter(Boolean)
  const cities = (filter.cities || []).map((x) => String(x).trim()).filter(Boolean)
  const platforms = (filter.platforms || []).map((x) => String(x).trim()).filter(Boolean)
  const levels = (filter.douyinSalesLevels || []).map((x) => normalizeDouyinLevel(x)).filter(Boolean)
  const tiers = (filter.followerTiers || []).map((x) => String(x).trim()).filter(Boolean)

  const id = String(member.id || '').trim()
  const linked = ctx ? (ctx.linkedEntriesByMemberId.get(id) ?? []) : libraryEntriesForMember(member, libraryEntries, members)
  const lib = linked[0]
  const province = String(member.province || lib?.province || '').trim()
  const city = String(member.city || lib?.city || '').trim()
  if (provinces.length && !provinces.includes(province)) return false
  if (cities.length && !cities.includes(city)) return false

  const profiles = ctx
    ? (ctx.profilesByMemberId.get(id) ?? [])
    : collectAnnouncementProfiles(member, libraryEntries, members)
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
  ctx?: MpAnnouncementMemberContext,
): RegistryMpTalentMember[] {
  const c = ctx ?? buildMpAnnouncementMemberContext(members, libraryEntries)
  const matched = c.announceableMembers.filter((m) =>
    matchMpTalentMemberForAnnouncement(m, filter, libraryEntries, c.talentMembers, c),
  )
  const selected = [...new Set((filter.selectedMemberIds || []).map((id) => String(id).trim()).filter(Boolean))]
  if (selected.length) {
    const set = new Set(selected)
    return matched.filter((m) => set.has(m.id))
  }
  return matched
}
