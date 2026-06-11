/** 招募推荐匹配：达人/拍摄/剪辑 ↔ 商单 的 payload 与本地兜底（Web + 小程序逻辑对齐） */

import { ensureTagTextColor, resolveHallAiTagStyle } from './hallAiTagStyle.js'

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
  categoryTagsText?: string
  budgetText?: string
  fansRequirement?: string
  recruitTarget?: string
  hall?: string
  urgent?: boolean
  isIce?: boolean
  isMock?: boolean
  summary?: string
  priceAmount?: number
  cpsPercent?: number | null
  feeMode?: string
  hasCommission?: boolean
  budgetDisplay?: { cps?: string; mode?: string; line?: string; kind?: string }
  talentTags?: string[]
  recruitmentInfo?: string
  merchantRequirements?: string
  taskDetail?: string
  recruitContent?: string
}

export type RegionMatchLevel = 'same_city' | 'same_province' | 'national' | 'mismatch' | 'unknown'

const COMMISSION_TAG_RE = /佣金友好|高佣优选|高佣/

export function parseCpsPercentFromBudget(budgetText: string): number | null {
  const m = String(budgetText || '').match(/CPS\s*([\d.]+)\s*%/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

export function resolveOrderFeeTraits(order: Pick<OrderMatchPayload, 'budgetText' | 'budgetDisplay'>): {
  cpsPercent: number | null
  feeMode: string
  hasCommission: boolean
} {
  const budgetText = String(order.budgetText || '')
  let cpsPercent = parseCpsPercentFromBudget(budgetText)
  const bd = order.budgetDisplay
  if (cpsPercent == null && bd?.cps) cpsPercent = parseCpsPercentFromBudget(String(bd.cps))
  let feeMode = 'unknown'
  if (/纯置换/.test(budgetText) || (/置换/.test(budgetText) && !/一口价/.test(budgetText))) feeMode = 'exchange'
  else if (/一口价/.test(budgetText)) feeMode = 'fixed'
  else if (/自报价/.test(budgetText)) feeMode = 'self_quote'
  else if (/等级阶梯|粉丝阶梯/.test(budgetText) || bd?.kind === 'tiers') feeMode = 'tier'
  const hasCommission = cpsPercent != null && cpsPercent > 0
  return { cpsPercent, feeMode, hasCommission }
}

function pickCategoryHighlightTag(categoryTagsText?: string): string {
  const raw = String(categoryTagsText || '').trim()
  if (!raw || raw === '—') return ''
  const first = (raw.split(/[、,，/]/)[0] || '').trim()
  if (!first || first.length > 6) return ''
  return first
}

/** 大厅卡片 AI 标签本地兜底（Web + 小程序逻辑对齐） */
export function fallbackOrderHighlightTag(row: OrderMatchPayload, talentCity = ''): {
  aiTag: string
  aiTagTone: string
} {
  if (row.isMock) return { aiTag: '演示', aiTagTone: 'default' }
  if (row.isIce) return { aiTag: '云剪直派', aiTagTone: 'ice' }
  if (row.urgent) return { aiTag: '急单速报', aiTagTone: 'urgent' }
  const region = String(row.region || '')
  if (talentCity && region.includes(talentCity) && !region.includes('全国')) {
    return { aiTag: '同城优选', aiTagTone: 'match' }
  }
  const traits = resolveOrderFeeTraits(row)
  if (traits.hasCommission) return { aiTag: '佣金友好', aiTagTone: 'hot' }
  if (traits.feeMode === 'exchange') return { aiTag: '置换友好', aiTagTone: 'niche' }
  if (traits.feeMode === 'fixed') {
    if ((row.priceAmount || 0) >= 1000) return { aiTag: '高价单', aiTagTone: 'budget' }
    return { aiTag: '一口价', aiTagTone: 'budget' }
  }
  if (traits.feeMode === 'self_quote') return { aiTag: '自报价', aiTagTone: 'match' }
  if (traits.feeMode === 'tier') return { aiTag: '阶梯报价', aiTagTone: 'budget' }
  if ((row.priceAmount || 0) >= 1000) return { aiTag: '高价单', aiTagTone: 'budget' }
  const catTag = pickCategoryHighlightTag(row.categoryTagsText)
  if (catTag) return { aiTag: catTag, aiTagTone: 'niche' }
  if (String(row.fansRequirement || '').includes('不限')) return { aiTag: '门槛低', aiTagTone: 'niche' }
  return { aiTag: '值得看看', aiTagTone: 'default' }
}

export function sanitizeAiOrderTag(
  tag: string,
  tone: string,
  row: OrderMatchPayload,
): { tag: string; tone: string } | null {
  const t = String(tag || '').trim().slice(0, 6)
  if (!t) return null
  const traits = resolveOrderFeeTraits(row)
  if (COMMISSION_TAG_RE.test(t) && !traits.hasCommission) return null
  return { tag: t, tone: String(tone || 'default').trim() || 'default' }
}

/** 合并招募单全文供 AI 分析（标题 + 要求 + 说明 + 任务详情） */
export function buildRecruitContentForAi(mp: {
  title?: unknown
  merchantRequirements?: unknown
  recruitmentInfo?: unknown
  taskDetail?: unknown
}): string {
  const parts: string[] = []
  const title = String(mp.title || '').trim()
  if (title) parts.push(`招募标题：${title}`)
  const req = String(mp.merchantRequirements || '').trim()
  if (req) parts.push(`招募要求：${req}`)
  const info = String(mp.recruitmentInfo || '').trim()
  if (info) parts.push(`招募说明：${info}`)
  const task = String(mp.taskDetail || '').trim()
  if (task) parts.push(`任务详情：${task}`)
  return parts.join('\n').slice(0, 2400)
}

export type HallAiTagRecord = {
  tag: string
  tone: string
  bg: string
  fg: string
  provider?: string
  taggedAt?: string
}

export function withHallAiTagColors(
  tag: string,
  tone: string,
  stored?: { bg?: string; fg?: string },
): { aiTag: string; aiTagTone: string; aiTagBg: string; aiTagFg: string } {
  const text = String(tag || '').trim().slice(0, 6)
  const toneKey = String(tone || 'default').trim() || 'default'
  const storedBg = String(stored?.bg || '').trim()
  const storedFg = String(stored?.fg || '').trim()
  if (storedBg) {
    const fg = ensureTagTextColor(storedBg, storedFg || undefined)
    return { aiTag: text, aiTagTone: toneKey, aiTagBg: storedBg, aiTagFg: fg }
  }
  const s = resolveHallAiTagStyle(text, toneKey)
  return { aiTag: s.tag, aiTagTone: s.tone, aiTagBg: s.bg, aiTagFg: s.fg }
}

export function readHallAiTagFromMeta(meta: unknown): HallAiTagRecord | null {
  if (!meta || typeof meta !== 'object') return null
  const raw = (meta as Record<string, unknown>).hallAiTag
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  const tag = String(t.tag || '').trim().slice(0, 6)
  if (!tag) return null
  const tone = String(t.tone || 'default').trim().slice(0, 16) || 'default'
  const styled = withHallAiTagColors(tag, tone, {
    bg: String(t.bg || '').trim(),
    fg: String(t.fg || '').trim(),
  })
  return {
    tag: styled.aiTag,
    tone: styled.aiTagTone,
    bg: styled.aiTagBg,
    fg: styled.aiTagFg,
    provider: String(t.provider || '').trim() || undefined,
    taggedAt: String(t.taggedAt || '').trim() || undefined,
  }
}

export function enrichOrderAiPayload<T extends OrderMatchPayload>(row: T): T & {
  cpsPercent: number | null
  feeMode: string
  hasCommission: boolean
  recruitContent: string
} {
  const traits = resolveOrderFeeTraits(row)
  const recruitContent =
    String(row.recruitContent || '').trim() ||
    buildRecruitContentForAi({
      title: row.title,
      merchantRequirements: row.merchantRequirements,
      recruitmentInfo: row.recruitmentInfo,
      taskDetail: row.taskDetail,
    })
  return {
    ...row,
    categoryTagsText: row.categoryTagsText || '',
    talentTags: Array.isArray(row.talentTags) ? row.talentTags : [],
    recruitContent,
    cpsPercent: traits.cpsPercent,
    feeMode: traits.feeMode,
    hasCommission: traits.hasCommission,
  }
}

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

export function mergeCardAiTags<
  T extends { id: string; aiTag?: string; aiTagTone?: string; aiTagBg?: string; aiTagFg?: string; aiTagSource?: string },
>(scored: T[], tagged: T[]): T[] {
  const byId = new Map(tagged.map((r) => [r.id, r]))
  return scored.map((row) => {
    const t = byId.get(row.id)
    if (!t) return row
    const tagFromAi = t.aiTagSource === 'ai' && t.aiTag
    return {
      ...row,
      aiTag: tagFromAi ? t.aiTag : t.aiTag || row.aiTag,
      aiTagTone: tagFromAi ? t.aiTagTone : t.aiTagTone || row.aiTagTone,
      aiTagBg: tagFromAi ? t.aiTagBg : t.aiTagBg || row.aiTagBg,
      aiTagFg: tagFromAi ? t.aiTagFg : t.aiTagFg || row.aiTagFg,
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
    aiTagBg: string
    aiTagFg: string
    aiMatch: boolean
    aiTagSource: 'ai' | 'local'
  }
> {
  const profile = { ...talent, city: talent.city || talentCity }
  return rows.map((row) => {
    const hit = map[row.id]
    if (hit && hit.score > 0) {
      const score = clampMatchScoreByFacts(hit.score, row, profile)
      const tag = hit.tag || (score >= 72 ? '高匹配' : '')
      const tone = hit.tone || (score >= 72 ? 'match' : 'default')
      const styled = withHallAiTagColors(tag, tone)
      return {
        ...row,
        matchScore: score,
        aiTag: styled.aiTag,
        aiTagTone: styled.aiTagTone,
        aiTagBg: styled.aiTagBg,
        aiTagFg: styled.aiTagFg,
        aiMatch: score >= 58,
        aiTagSource: 'ai' as const,
      }
    }
    const fb = fallbackOrderMatchScore(row, profile)
    const styled = withHallAiTagColors(fb.tag, fb.tone)
    return {
      ...row,
      matchScore: fb.score,
      aiTag: styled.aiTag,
      aiTagTone: styled.aiTagTone,
      aiTagBg: styled.aiTagBg,
      aiTagFg: styled.aiTagFg,
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
