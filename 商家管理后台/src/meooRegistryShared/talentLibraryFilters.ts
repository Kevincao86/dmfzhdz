import type {
  RegistryMpTalentMember,
  RegistryTalentLibraryEntry,
} from './opsRegistryTypes.js'
import { collectMemberPlatformProfiles } from './mpTalentPlatformProfileResolve.js'
import { talentLibraryDedupeKey } from './talentLibraryUpsert.js'

export const TALENT_LIBRARY_TAG_OPTS = [
  '美食',
  '母婴',
  '家居家装',
  '生活记录',
  '美妆时尚',
  '健康养生',
  '运动健身',
  '教育',
  '摄影',
  '酒店旅游',
  '文化艺术',
  '兴趣爱好',
  '科技数码',
  '影视综艺',
  '宠物',
  '情感',
  '搞笑',
  '娱乐资讯',
  '汽车',
  '商业财经',
  '游戏',
  '民生资讯',
  '体育赛事',
  '知识',
  '其它',
] as const

export const TALENT_FOLLOWER_TIER_OPTS = [
  '1000-5000',
  '5000-1万',
  '1万+',
  '5万+',
  '10万+',
  '50万+',
] as const

export const TALENT_DOUYIN_LEVEL_OPTS = [
  'LV0',
  'LV1',
  'LV2',
  'LV3',
  'LV4',
  'LV5',
  'LV6',
  'LV7',
  'LV8',
  '暂无等级',
] as const

export const TALENT_GENDER_OPTS = ['全部', '男', '女'] as const

export type TalentLibraryFilterState = {
  gender: string
  followerTiers: string[]
  douyinLevels: string[]
  tag: string
}

export function normalizeDouyinLevel(level: string): string {
  const raw = String(level || '').trim()
  if (!raw || /暂无/.test(raw)) return '暂无等级'
  const u = raw.toUpperCase().replace(/\s/g, '')
  const m = u.match(/^L(?:V)?([0-8])$/)
  if (m) return `LV${m[1]}`
  if (/^L6\+?$/.test(u)) return 'LV6'
  return raw.toUpperCase().startsWith('LV') ? raw.toUpperCase() : raw
}

export function followerMatchesTier(followers: number, tier: string): boolean {
  const n = Math.max(0, Number(followers) || 0)
  switch (tier) {
    case '1000-5000':
      return n >= 1000 && n < 5000
    case '5000-1万':
      return n >= 5000 && n < 10000
    case '1万+':
      return n >= 10000 && n < 50000
    case '5万+':
      return n >= 50000 && n < 100000
    case '10万+':
      return n >= 100000 && n < 500000
    case '50万+':
      return n >= 500000
    default:
      return false
  }
}

export function collectTagsForPlatform(member: RegistryMpTalentMember, platform: string): string[] {
  const set = new Set<string>()
  for (const t of member.accountTags || []) {
    const s = String(t || '').trim()
    if (s) set.add(s)
  }
  for (const { platform: p, profile } of collectMemberPlatformProfiles(member)) {
    if (p !== platform) continue
    for (const t of profile.accountTags || []) {
      const s = String(t || '').trim()
      if (s) set.add(s)
    }
  }
  return [...set]
}

export function findMemberForLibraryEntry(
  entry: RegistryTalentLibraryEntry,
  members: RegistryMpTalentMember[],
): RegistryMpTalentMember | null {
  const lq = String(entry.lingqiTalentId || '').trim()
  if (lq) {
    const hit = members.find((m) => String(m.lingqiTalentId || '').trim() === lq)
    if (hit) return hit
  }
  const key = talentLibraryDedupeKey(entry.platform, entry.platformAccount)
  for (const m of members) {
    for (const { platform, profile } of collectMemberPlatformProfiles(m)) {
      const acct = String(profile.platformAccount || '').trim()
      if (!acct) continue
      if (talentLibraryDedupeKey(platform, acct) === key) return m
    }
  }
  return null
}

export function enrichTalentLibraryEntry(
  entry: RegistryTalentLibraryEntry,
  members: RegistryMpTalentMember[],
): RegistryTalentLibraryEntry {
  const gender = String(entry.gender || '').trim()
  const tags = Array.isArray(entry.accountTags) ? entry.accountTags.filter(Boolean) : []
  if (gender && tags.length) return entry
  const member = findMemberForLibraryEntry(entry, members)
  if (!member) return entry
  return {
    ...entry,
    gender: gender || String(member.gender || '').trim() || undefined,
    accountTags: tags.length ? tags : collectTagsForPlatform(member, entry.platform),
  }
}

export function matchTalentLibraryFilters(
  entry: RegistryTalentLibraryEntry,
  f: TalentLibraryFilterState,
): boolean {
  const gender = String(entry.gender || '').trim()
  if (f.gender !== '全部') {
    if (!gender || gender === '不限') return false
    if (gender !== f.gender) return false
  }
  if (f.followerTiers.length) {
    if (!f.followerTiers.some((tier) => followerMatchesTier(entry.followers, tier))) return false
  }
  if (f.douyinLevels.length) {
    const lv = normalizeDouyinLevel(entry.douyinSalesLevel || '')
    if (!f.douyinLevels.some((x) => normalizeDouyinLevel(x) === lv)) return false
  }
  if (f.tag !== '全部') {
    const tags = entry.accountTags || []
    if (!tags.includes(f.tag)) return false
  }
  return true
}
