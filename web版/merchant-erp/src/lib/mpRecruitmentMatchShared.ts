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

/** 商单侧可检索城市/区域的文本（region 常为门店名，需合并标题与摘要） */
export function orderLocationText(order: Pick<OrderMatchPayload, 'region' | 'title' | 'summary' | 'category'>): string {
  return [order.region, order.title, order.summary, order.category].filter(Boolean).join(' · ')
}

export function regionMatchesTalent(
  region: string,
  city: string,
  province: string,
  extraContext = '',
): RegionMatchLevel {
  const r = [String(region || '').trim(), String(extraContext || '').trim()].filter(Boolean).join(' · ')
  if (!r) return 'unknown'
  if (r.includes('全国')) return 'national'
  const c = String(city || '').trim()
  const p = String(province || '').trim()
  const cShort = c.replace(/市$/, '')
  const pShort = p.replace(/省$/, '').replace(/市$/, '')
  if (c && (r.includes(c) || (cShort.length >= 2 && r.includes(cShort)))) return 'same_city'
  if (pShort.length >= 2 && r.includes(pShort)) return 'same_province'
  if (c || p) return 'mismatch'
  return 'unknown'
}

function fansRequirementMet(fansReq: string, followers: number): boolean {
  const req = String(fansReq || '').trim()
  if (!req || /不限|档位|按招募|按云剪|协商/.test(req)) return true
  const f = Number(followers) || 0
  const fm = req.match(/([\d.]+)\s*万/)
  const need = fm ? Number(fm[1]) * 10000 : Number((req.match(/(\d+)/) || [])[1] || 0)
  if (need <= 0) return true
  if (f <= 0) return true
  return f >= need * 0.85
}

function tagsOrCategoryAlign(order: OrderMatchPayload, talent: TalentMatchProfile): boolean {
  const cat = String(order.category || '').trim()
  const blob = orderLocationText(order)
  const tags = [...(talent.accountTags || []), ...(talent.tags || []), ...(talent.supplierSkills || [])].filter(
    Boolean,
  )
  if (cat && tags.some((t) => cat.includes(t) || t.includes(cat))) return true
  if (tags.some((t) => t.length >= 2 && blob.includes(t))) return true
  return false
}

function salesLevelAligns(order: OrderMatchPayload, talent: TalentMatchProfile): boolean {
  const level = String(talent.douyinSalesLevel || '').trim()
  if (!level) return true
  const blob = orderLocationText(order) + String(order.fansRequirement || '')
  if (/不限|档位|按招募/.test(blob)) return true
  const lvNum = level.replace(/\D/g, '')
  if (lvNum && blob.includes(lvNum)) return true
  if (/V[345]|Lv[345]|三级|四级|五级|带货/.test(blob) && level) return true
  return false
}

export type MatchFactSignals = {
  recruitTargetOk: boolean
  platformOk: boolean
  region: RegionMatchLevel
  fansOk: boolean
  tagsOk: boolean
  levelOk: boolean
}

export function analyzeMatchFacts(order: OrderMatchPayload, talent: TalentMatchProfile): MatchFactSignals {
  const loc = regionMatchesTalent(
    order.region || '',
    talent.city || '',
    talent.province || '',
    orderLocationText(order),
  )
  const plat = String(order.platform || '')
  const tPlat = String(talent.platform || '')
  const platformOk = !plat || !tPlat || plat === tPlat
  return {
    recruitTargetOk: recruitTargetMatchesOrder(order, talent),
    platformOk,
    region: loc,
    fansOk: fansRequirementMet(String(order.fansRequirement || ''), Number(talent.followers) || 0),
    tagsOk: tagsOrCategoryAlign(order, talent),
    levelOk: salesLevelAligns(order, talent),
  }
}

/** 事实高度一致时的分数下限（防止模型保守给 50 分） */
export function strongMatchScoreFloor(signals: MatchFactSignals): number {
  if (!signals.recruitTargetOk || !signals.platformOk) return 0
  if (signals.region === 'mismatch') return 0

  const regional =
    signals.region === 'same_city'
      ? 78
      : signals.region === 'same_province'
        ? 62
        : signals.region === 'national'
          ? 55
          : signals.region === 'unknown'
            ? 50
            : 0

  let floor = regional
  if (signals.fansOk) floor += 6
  if (signals.tagsOk) floor += 8
  if (signals.levelOk) floor += 4

  const core =
    signals.region === 'same_city' &&
    signals.platformOk &&
    signals.fansOk &&
    (signals.tagsOk || signals.levelOk)

  if (core) floor = Math.max(floor, 88)
  else if (signals.region === 'same_city' && signals.platformOk && signals.fansOk) {
    floor = Math.max(floor, 80)
  }

  return Math.min(95, floor)
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

/** AI / 本地分统一事实校准：跨城、平台不符、身份不符不得虚高；高度契合则抬升下限 */
export function clampMatchScoreByFacts(
  score: number,
  order: OrderMatchPayload,
  talent: TalentMatchProfile,
): number {
  let s = Number(score)
  if (!Number.isFinite(s)) s = 0

  const facts = analyzeMatchFacts(order, talent)

  if (!facts.recruitTargetOk) {
    return Math.max(0, Math.min(100, Math.round(Math.min(s, 28))))
  }

  if (!facts.platformOk) {
    s = Math.min(s, 42)
  }

  if (facts.region === 'mismatch') s = Math.min(s, 48)
  else if (facts.region === 'unknown' && !String(order.region || '').includes('全国')) {
    s = Math.min(s, 58)
  }

  if (!facts.fansOk) s = Math.min(s, 44)

  const floor = strongMatchScoreFloor(facts)
  if (floor > 0) s = Math.max(s, floor)

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

  const loc = regionMatchesTalent(
    order.region || '',
    talent.city || '',
    talent.province || '',
    orderLocationText(order),
  )
  if (loc === 'same_city') s += 28
  else if (loc === 'same_province') s += 14
  else if (loc === 'national') s += 8
  else if (loc === 'mismatch') s -= 10

  if (tagsOrCategoryAlign(order, talent)) s += 14
  if (salesLevelAligns(order, talent)) s += 6

  const f = Number(talent.followers) || 0
  if (fansRequirementMet(String(order.fansRequirement || ''), f)) s += 10
  else if (f > 0) s -= 10

  const habits = talent.applicationHabits
  const cat = String(order.category || '')
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
