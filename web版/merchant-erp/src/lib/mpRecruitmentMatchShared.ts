/** 招募推荐匹配：达人/拍摄/剪辑 ↔ 商单 的 payload 与本地兜底（Web + 小程序逻辑对齐） */

export type ApplicationHabits = {
  recentApplyCount?: number
  preferredPlatforms?: string[]
  preferredRegions?: string[]
  preferredCategories?: string[]
  iceApplyRatio?: number
  urgentApplyRatio?: number
}

export type TalentMatchProfile = {
  workIdentity?: string
  role?: string
  roleLabel?: string
  recruitTarget?: string
  platform?: string
  nickname?: string
  followers?: string | number
  city?: string
  province?: string
  region?: string
  accountTags?: string[]
  douyinSalesLevel?: string
  quotePrice?: string
  gender?: string
  quality?: string
  tags?: string[]
  supplierSkills?: string[]
  applicationHabits?: ApplicationHabits
}

export type OrderMatchPayload = {
  id: string
  title?: string
  platform?: string
  region?: string
  category?: string
  budgetText?: string
  fansRequirement?: string
  recruitTarget?: string
  hall?: string
  urgent?: boolean
  isIce?: boolean
  summary?: string
  priceAmount?: number
}

export function applicationHabitsFromApps(
  apps: Array<{ platform?: string; region?: string; city?: string; category?: string; isIce?: boolean; urgent?: boolean }>,
): ApplicationHabits {
  const platforms: Record<string, number> = {}
  const regions: Record<string, number> = {}
  const categories: Record<string, number> = {}
  let iceCount = 0
  let urgentCount = 0
  for (const a of apps.slice(0, 40)) {
    const p = String(a.platform || '').trim()
    if (p) platforms[p] = (platforms[p] || 0) + 1
    const r = String(a.region || a.city || '').trim()
    if (r) regions[r] = (regions[r] || 0) + 1
    const c = String(a.category || '').trim()
    if (c) categories[c] = (categories[c] || 0) + 1
    if (a.isIce) iceCount += 1
    if (a.urgent) urgentCount += 1
  }
  const top = (obj: Record<string, number>) =>
    Object.keys(obj)
      .sort((x, y) => (obj[y] || 0) - (obj[x] || 0))
      .slice(0, 5)
  return {
    recentApplyCount: apps.length,
    preferredPlatforms: top(platforms),
    preferredRegions: top(regions),
    preferredCategories: top(categories),
    iceApplyRatio: apps.length ? Math.round((iceCount / apps.length) * 100) : 0,
    urgentApplyRatio: apps.length ? Math.round((urgentCount / apps.length) * 100) : 0,
  }
}

export function fallbackOrderMatchScore(
  order: OrderMatchPayload,
  talent: TalentMatchProfile,
): { score: number; tag: string; tone: string } {
  let s = 38
  const plat = String(order.platform || '')
  const tPlat = String(talent.platform || '')
  if (plat && tPlat && plat === tPlat) s += 18

  const region = String(order.region || '')
  const city = String(talent.city || talent.region?.split('·')[0]?.trim() || '')
  if (region.includes('全国')) s += 6
  else if (city) {
    const short = city.replace(/市$/, '')
    if (region.includes(city) || (short.length >= 2 && region.includes(short))) s += 16
  }

  const cat = String(order.category || '')
  const tags = [...(talent.accountTags || []), ...(talent.tags || []), ...(talent.supplierSkills || [])]
  if (cat && tags.some((t) => t && (cat.includes(t) || t.includes(cat)))) s += 14

  const target = String(order.recruitTarget || 'talent')
  const wid = String(talent.workIdentity || talent.role || 'talent')
  if (target === wid) s += 14
  else if (target === 'edit' && wid === 'edit') s += 14
  else if (target === 'shoot' && wid === 'shoot') s += 14
  else if (target !== wid) s -= 18

  const fansReq = String(order.fansRequirement || '')
  const f = Number(talent.followers) || 0
  if (fansReq.includes('不限')) s += 10
  else {
    const fm = fansReq.match(/([\d.]+)\s*万/)
    const need = fm ? Number(fm[1]) * 10000 : Number((fansReq.match(/(\d+)/) || [])[1] || 0)
    if (need > 0 && f >= need) s += 12
  }

  if ((order.priceAmount || 0) >= 500) s += 4
  if (order.urgent && (talent.applicationHabits?.urgentApplyRatio || 0) > 20) s += 6
  if (order.isIce && wid === 'edit') s += 10

  const habits = talent.applicationHabits
  if (habits?.preferredPlatforms?.includes(plat)) s += 8
  if (cat && habits?.preferredCategories?.some((c) => cat.includes(c) || c.includes(cat))) s += 6

  const score = Math.max(0, Math.min(90, Math.round(s)))
  let tag = '可看看'
  if (score >= 78) tag = '高匹配'
  else if (score >= 65) tag = '较契合'
  else if (plat && tPlat && plat === tPlat) tag = '平台匹配'
  return { score, tag, tone: score >= 65 ? 'match' : 'default' }
}

export function mergeCardAiTags<T extends { id: string; aiTag?: string; aiTagTone?: string; aiTagSource?: string }>(
  scored: T[],
  tagged: T[],
): T[] {
  const byId = new Map(tagged.map((r) => [r.id, r]))
  return scored.map((row) => {
    const t = byId.get(row.id)
    if (!t) return row
    const tagFromAi = t.aiTagSource === 'ai' && t.aiTag
    return {
      ...row,
      aiTag: tagFromAi ? t.aiTag : t.aiTag || row.aiTag,
      aiTagTone: tagFromAi ? t.aiTagTone : t.aiTagTone || row.aiTagTone,
      aiTagSource: tagFromAi ? 'ai' : t.aiTagSource || row.aiTagSource,
    }
  })
}

export function applyOrderMatchResults<T extends OrderMatchPayload & { id: string }>(
  rows: T[],
  map: Record<string, { score: number; tag: string; tone: string }>,
  talent: TalentMatchProfile,
  talentCity = '',
): Array<
  T & {
    matchScore: number
    aiTag: string
    aiTagTone: string
    aiMatch: boolean
    aiTagSource: 'ai' | 'local'
  }
> {
  return rows.map((row) => {
    const hit = map[row.id]
    if (hit && hit.score > 0) {
      const score = Math.max(0, Math.min(100, Math.round(hit.score)))
      return {
        ...row,
        matchScore: score,
        aiTag: hit.tag || (score >= 75 ? '高匹配' : ''),
        aiTagTone: hit.tone || (score >= 75 ? 'match' : 'default'),
        aiMatch: score >= 60,
        aiTagSource: 'ai' as const,
      }
    }
    const fb = fallbackOrderMatchScore(row, { ...talent, city: talent.city || talentCity })
    return {
      ...row,
      matchScore: fb.score,
      aiTag: fb.tag,
      aiTagTone: fb.tone,
      aiMatch: fb.score >= 55,
      aiTagSource: 'local' as const,
    }
  })
}
