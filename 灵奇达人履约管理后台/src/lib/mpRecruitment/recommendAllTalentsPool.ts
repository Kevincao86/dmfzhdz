/**
 * 【锁定】推荐大厅 · 全部达人列表数据源
 *
 * 权威数据源：商家管理后台「达人库」= registry.talentLibraryEntries（只读，不写 DB）
 * 禁止用 mpTalentMembers 空壳 wx 账号凑数；会员仅用于头像/私信 MTM id / 标签补全。
 */
import type { MpRegistry, TalentCardRow } from './types'
import { formatTalent, parseFollowers } from './talentFormat'
import { primaryPlatformProfile } from '../mpSync/talentMember'
import { canonicalTalentMemberIdFromRegistry } from '../mpSync/talentChatKeys'
import { platformIdFromName } from '../mpSync/talentPlatformProfiles'

function platAccountDedupeKey(platform: string, account: string): string | null {
  const a = String(account || '').trim().toLowerCase()
  if (!a) return null
  return `${String(platform || '抖音').trim()}::${a}`
}

function phoneKey(raw: unknown): string {
  return String(raw || '')
    .replace(/\D/g, '')
    .slice(-11)
}

function findMemberForLibraryEntry(
  entry: Record<string, unknown>,
  members: Record<string, unknown>[],
): Record<string, unknown> | null {
  const lq = String(entry.lingqiTalentId || '').trim()
  if (lq) {
    const hit = members.find((m) => String(m.lingqiTalentId || '').trim() === lq)
    if (hit) return hit
  }
  const entryPhone = phoneKey(entry.contact || entry.wechatId)
  if (entryPhone.length >= 11) {
    const hit = members.find((m) => phoneKey(m.contact || m.wechatId) === entryPhone)
    if (hit) return hit
  }
  const key = platAccountDedupeKey(String(entry.platform || '抖音'), String(entry.platformAccount || ''))
  if (!key) return null
  for (const m of members) {
    const extraProfiles: { platform: string; profile: Record<string, unknown> }[] = []
    const pp = m.platformProfiles
    if (pp && typeof pp === 'object' && !Array.isArray(pp)) {
      for (const [id, prof] of Object.entries(pp as Record<string, unknown>)) {
        if (prof && typeof prof === 'object' && !Array.isArray(prof)) {
          extraProfiles.push({ platform: id, profile: prof as Record<string, unknown> })
        }
      }
    }
    const primary = primaryPlatformProfile(m)
    const profiles = [
      primary ? { platform: primary.platform, profile: primary.profile as Record<string, unknown> } : null,
      ...extraProfiles,
    ].filter(Boolean) as { platform: string; profile: Record<string, unknown> }[]
    for (const item of profiles) {
      const p = item.profile
      const plat =
        item.platform === 'douyin'
          ? '抖音'
          : item.platform === 'xiaohongshu'
            ? '小红书'
            : String(item.platform || '抖音')
      const pk = platAccountDedupeKey(plat, String(p.platformAccount || ''))
      if (pk === key) return m
    }
  }
  return null
}

function memberAvatar(member: Record<string, unknown> | null | undefined): string {
  if (!member) return ''
  return String(member.wxAvatarUrl || member.avatarUrl || '').trim()
}

function buildMemberIndex(members: Record<string, unknown>[]) {
  const byId = new Map<string, Record<string, unknown>>()
  const byLq = new Map<string, Record<string, unknown>>()
  for (const m of members) {
    const id = String(m.id || '').trim()
    const lq = String(m.lingqiTalentId || '').trim()
    if (id) byId.set(id, m)
    if (lq) byLq.set(lq, m)
  }
  return { byId, byLq }
}

function resolveAvatarForEntry(
  enriched: Record<string, unknown>,
  member: Record<string, unknown> | null,
  index: ReturnType<typeof buildMemberIndex>,
): string {
  const direct = String(enriched.avatarUrl || enriched.wxAvatarUrl || enriched.avatar || '').trim()
  if (direct && !direct.startsWith('wxfile://')) return direct
  const fromMember = memberAvatar(member)
  if (fromMember) return fromMember
  const lq = String(enriched.lingqiTalentId || '').trim()
  if (lq && index.byLq.has(lq)) return memberAvatar(index.byLq.get(lq))
  const chatId = String(enriched.id || '').trim()
  if (chatId && index.byId.has(chatId)) return memberAvatar(index.byId.get(chatId))
  const phone = phoneKey(enriched.contact || enriched.wechatId)
  if (phone.length >= 11) {
    for (const m of index.byId.values()) {
      if (phoneKey(m.contact || m.wechatId) === phone) return memberAvatar(m)
    }
  }
  return ''
}

function resolveLibraryEntryProfileLink(
  entry: Record<string, unknown>,
  member: Record<string, unknown> | null,
): string {
  const fromEntry = String(entry.profileLink || '').trim()
  if (fromEntry) return fromEntry
  if (!member) return ''
  const platform = String(entry.platform || '抖音')
  const pid = platformIdFromName(platform)
  const profs = member.platformProfiles as Record<string, { profileLink?: string }> | undefined
  const prof = profs?.[pid]
  if (prof?.profileLink) return String(prof.profileLink).trim()
  const primary = primaryPlatformProfile(member)
  if (primary?.platform === platform && primary.profile?.profileLink) {
    return String(primary.profile.profileLink).trim()
  }
  return ''
}

function enrichLibraryEntry(
  entry: Record<string, unknown>,
  members: Record<string, unknown>[],
): Record<string, unknown> {
  const gender = String(entry.gender || '').trim()
  const tags = Array.isArray(entry.accountTags) ? (entry.accountTags as string[]).filter(Boolean) : []
  const profileLink = String(entry.profileLink || '').trim()
  const member = findMemberForLibraryEntry(entry, members)
  const needsMember = !gender || !tags.length || !profileLink
  if (!needsMember) return entry
  if (!member) return entry
  const out: Record<string, unknown> = { ...entry }
  if (!gender) out.gender = String(member.gender || '').trim() || entry.gender
  if (!tags.length && Array.isArray(member.accountTags) && member.accountTags.length) {
    out.accountTags = member.accountTags
  }
  if (!profileLink) {
    const link = resolveLibraryEntryProfileLink(entry, member)
    if (link) out.profileLink = link
  }
  return out
}

function libraryCardId(reg: MpRegistry, entry: Record<string, unknown>): string {
  const raw = String(entry.id || entry.lingqiTalentId || '').trim()
  return canonicalTalentMemberIdFromRegistry(reg, raw) || raw
}

/** 从注册表构建「全部达人」列表：与商家管理后台达人库 1:1 */
export function buildAllTalentsPool(reg: MpRegistry): TalentCardRow[] {
  const library = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries : []
  const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
  const memberIndex = buildMemberIndex(members as Record<string, unknown>[])
  const out: TalentCardRow[] = []
  const seenIds = new Set<string>()

  for (const e of library) {
    const row = e as Record<string, unknown>
    const enriched = enrichLibraryEntry(row, members as Record<string, unknown>[])
    const chatId = libraryCardId(reg, enriched)
    if (!chatId || seenIds.has(chatId)) continue
    seenIds.add(chatId)
    const nick = String(
      enriched.platformNickname || enriched.name || enriched.lingqiTalentId || enriched.platformAccount || '',
    ).trim()
    if (!nick) continue
    const member = findMemberForLibraryEntry(enriched, members as Record<string, unknown>[])
    const followers = parseFollowers(enriched.followers)
    const accountTags = Array.isArray(enriched.accountTags)
      ? (enriched.accountTags as string[]).filter(Boolean)
      : Array.isArray(member?.accountTags)
        ? (member!.accountTags as string[]).filter(Boolean)
        : []
    out.push(
      formatTalent({
        ...enriched,
        id: chatId,
        platformNickname: nick,
        wxAvatarUrl: resolveAvatarForEntry(enriched, member, memberIndex),
        platform: enriched.platform || '抖音',
        followers,
        province: enriched.province || member?.province,
        city: enriched.city || member?.city,
        gender: enriched.gender || member?.gender,
        accountTags,
        qualityTag: followers >= 50000 ? '优质' : '推荐',
        douyinSalesLevel: enriched.douyinSalesLevel || member?.douyinSalesLevel || '',
      }),
    )
  }

  return out
}

export function registryHasRecommendTalentPool(reg: MpRegistry | Record<string, unknown> | null | undefined): boolean {
  if (!reg || typeof reg !== 'object') return false
  const lib = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries.length : 0
  return lib > 0
}

export function expectTalentLibraryPoolSize(reg: MpRegistry | Record<string, unknown> | null | undefined): number {
  if (!reg || typeof reg !== 'object') return 0
  return Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries.length : 0
}
