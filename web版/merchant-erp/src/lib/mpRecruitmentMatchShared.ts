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
  id?: string
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

export type RegionMatchLevel = 'same_city' | 'same_province' | 'national' | 'mismatch' | 'unknown'

/** 稳定缓存键：不含报名习惯等易变字段，同账号同资料应命中同一分 */
export function talentMatchCacheKey(talent: TalentMatchProfile | null | undefined): string {
  if (!talent) return 'guest'
  return [
    String(talent.id || '').trim(),
    talent.workIdentity || talent.role || 'talent',
    talent.platform || '',
    talent.city || '',
    talent.province || '',
    String(talent.followers ?? ''),
    talent.douyinSalesLevel || '',
    talent.quotePrice || '',
    (talent.accountTags || []).slice(0, 8).join(','),
  ]
    .join('|')
    .slice(0, 200)
}

export function regionMatchesTalent(
  region: string,
  city: string,
  province: string,
): RegionMatchLevel {
  const r = String(region || '').trim()
  if (!r) return 'unknown'
  if (r.includes('全国')) return 'national'
  const c = String(city || '').trim()
  const p = String(province || '').trim()
  const cShort = c.replace(/市$/, '')
  const pShort = p.replace(/省$/, '')
  if (c && (r.includes(c) || (cShort.length >= 2 && r.includes(cShort)))) return 'same_city'
  if (pShort.length >= 2 && r.includes(pShort)) return 'same_province'
  if (c || p) return 'mismatch'
  return 'unknown'
}

export function recruitTargetMatchesOrder(
  order: OrderMatchPayload,
  talent: TalentMatchProfile,
): boolean {
  const target = String(order.recruitTarget || 'talent')
  const wid = String(talent.workIdentity || talent.role || 'talent')
  if (target === wid) return true
  if (target === 'edit' && order.isIce && wid === 'edit') return true
  return false
}

/** AI / 本地分统一事实校准：跨城、平台不符、身份不符不得虚高 */
export function clampMatchScoreByFacts(
  score: number,
  order: OrderMatchPayload,
  talent: TalentMatchProfile,
): number {
  let s = Number(score)
  if (!Number.isFinite(s)) s = 0

  if (!recruitTargetMatchesOrder(order, talent)) {
    return Math.max(0, Math.min(100, Math.round(Math.min(s, 28))))
  }

  const plat = String(order.platform || '')
  const tPlat = String(talent.platform || '')
  if (plat && tPlat && plat !== tPlat) {
    s = Math.min(s, 42)
  }

  const loc = regionMatchesTalent(order.region || '', talent.city || '', talent.province || '')
  if (loc === 'mismatch') s = Math.min(s, 48)
  else if (loc === 'unknown' && !String(order.region || '').includes('全国')) s = Math.min(s, 52)
  else if (loc === 'same_province' && s > 68) s = Math.min(s, 68)
  else if (loc === 'national' && s > 72) s = Math.min(s, 72)

  const fansReq = String(order.fansRequirement || '')
  const f = Number(talent.followers) || 0
  if (fansReq && !fansReq.includes('不限')) {
    const fm = fansReq.match(/([\d.]+)\s*万/)
    const need = fm ? Number(fm[1]) * 10000 : Number((fansReq.match(/(\d+)/) || [])[1] || 0)
    if (need > 0 && f > 0 && f < need * 0.85) s = Math.min(s, 44)
  }

  return Math.max(0, Math.min(100, Math.round(s)))
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
  if (!recruitTargetMatchesOrder(order, talent)) {
    return { score: 18, tag: '身份不符', tone: 'default' }
  }

  let s = 10
  const plat = String(order.platform || '')
  const tPlat = String(talent.platform || '')
  if (plat && tPlat && plat === tPlat) s += 14
  else if (plat && tPlat) s -= 6

  const loc = regionMatchesTalent(order.region || '', talent.city || '', talent.province || '')
  if (loc === 'same_city') s += 24
  else if (loc === 'same_province') s += 12
  else if (loc === 'national') s += 6
  else if (loc === 'mismatch') s -= 8

  const cat = String(order.category || '')
  const tags = [...(talent.accountTags || []), ...(talent.tags || []), ...(talent.supplierSkills || [])]
  if (cat && tags.some((t) => t && (cat.includes(t) || t.includes(cat)))) s += 12

  const fansReq = String(order.fansRequirement || '')
  const f = Number(talent.followers) || 0
  if (fansReq.includes('不限')) s += 2
  else {
    const fm = fansReq.match(/([\d.]+)\s*万/)
    const need = fm ? Number(fm[1]) * 10000 : Number((fansReq.match(/(\d+)/) || [])[1] || 0)
    if (need > 0 && f >= need) s += 10
    else if (need > 0 && f > 0) s -= 8
  }

  const habits = talent.applicationHabits
  if (habits?.preferredPlatforms?.includes(plat)) s += 3
  if (cat && habits?.preferredCategories?.some((c) => cat.includes(c) || c.includes(cat))) s += 2
  if (order.urgent && (habits?.urgentApplyRatio || 0) > 25) s += 2

  const score = clampMatchScoreByFacts(s, order, talent)
  let tag = '可看看'
  if (score >= 72) tag = '高匹配'
  else if (score >= 58) tag = '较契合'
  else if (loc === 'same_city') tag = '同城'
  else if (plat && tPlat && plat === tPlat) tag = '平台匹配'
  else if (loc === 'mismatch') tag = '异地'
  return { score, tag, tone: score >= 58 ? 'match' : 'default' }
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
  const profile = { ...talent, city: talent.city || talentCity }
  return rows.map((row) => {
    const hit = map[row.id]
    if (hit && hit.score > 0) {
      const score = clampMatchScoreByFacts(hit.score, row, profile)
      return {
        ...row,
        matchScore: score,
        aiTag: hit.tag || (score >= 72 ? '高匹配' : ''),
        aiTagTone: hit.tone || (score >= 72 ? 'match' : 'default'),
        aiMatch: score >= 58,
        aiTagSource: 'ai' as const,
      }
    }
    const fb = fallbackOrderMatchScore(row, profile)
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

export function clampTalentScoreForOrders(
  score: number,
  orders: OrderMatchPayload[],
  talent: TalentMatchProfile,
): number {
  if (!orders.length) return clampMatchScoreByFacts(score, { id: '' }, talent)
  let out = score
  for (const o of orders) {
    out = Math.min(out, clampMatchScoreByFacts(score, o, talent))
  }
  return out
}
