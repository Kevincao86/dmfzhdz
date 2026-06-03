import type { TalentCardRow } from './types'
import { matchCity, matchPlatform, normalizeHallPlatform } from './hallFilters'

export function formatFans(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return `${n}`
}

export function salesGradeFromFollowers(n: number): string {
  if (n >= 100000) return 'Lv5 头部达人'
  if (n >= 50000) return 'Lv4 资深达人'
  if (n >= 10000) return 'Lv3 带货达人'
  if (n >= 3000) return 'Lv2 成长达人'
  return 'Lv1 新锐达人'
}

export function formatTalent(row: Record<string, unknown>): TalentCardRow {
  const followersRaw = Number(row.followers) || 0
  const platform = normalizeHallPlatform(row.platform || '抖音')
  const tags: string[] = []
  if (row.qualityTag) tags.push(String(row.qualityTag))
  const accountTags = Array.isArray(row.accountTags) ? (row.accountTags as string[]) : []
  return {
    id: String(row.id),
    isPreview: false,
    name: String(row.platformNickname || row.name || '达人'),
    avatar: String(row.avatarUrl || row.wxAvatarUrl || ''),
    platform,
    followers: formatFans(followersRaw),
    followersRaw,
    salesGrade: String(row.salesGrade || salesGradeFromFollowers(followersRaw)),
    douyinSalesLevel: String(row.douyinSalesLevel || ''),
    quality: String(row.qualityTag || (followersRaw >= 50000 ? '优质' : followersRaw >= 10000 ? '推荐' : '新锐')),
    tags: tags.length ? tags : ['本地生活'],
    accountTags,
    region: [row.province, row.city].filter(Boolean).join(' · ') || String(row.region || ''),
    gender: String(row.gender || '不限'),
    online: row.online !== false,
    matchScore: 0,
    aiTag: '',
    aiTagTone: 'default',
    aiMatch: false,
  }
}

export function matchTalentFilters(
  row: TalentCardRow,
  f: { platform: string; city: string; tag: string; gender: string },
): boolean {
  if (!matchPlatform(row.platform, f.platform)) return false
  if (!matchCity(row.region, '', f.city)) return false
  if (f.tag !== '全部') {
    const blob = [row.quality, ...row.tags].join(' ')
    if (!blob.includes(f.tag)) return false
  }
  if (f.gender !== '全部' && row.gender !== f.gender && row.gender !== '不限') return false
  return true
}
