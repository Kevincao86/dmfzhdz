import type { KolTierKey } from './merchantRecruitmentTierPlan'
import { inferKolTierFromApplicant, kolTierLabel } from './merchantRecruitmentTierPlan'
import type { RegistryTalentLibraryEntry } from './opsRegistryTypes'
import { extractProfileLinkUrl } from './talentProfileLink'
import { isIncompleteTalentLibraryEntry } from './talentLibraryUpsert'
import {
  buildNoviceAllocationFromTalentLibrary,
  parseQuotePriceYuan,
  resolveTalentLibraryEntriesForCity,
} from './talentLibraryTierPricing'

export type TalentPlanSeat = {
  seatId: string
  tierKey: KolTierKey
  tierLabel: string
  unitBudgetYuan: number
  talentType: string
  platform: string
  lockedTalentId?: string
}

export type TalentPlanCard = {
  seatId: string
  talentId: string
  nickname: string
  city: string
  platform: string
  followers: number
  level: string
  quoteYuan: number | null
  tags: string[]
  /** 微信头像，仅 https。账号表只读补全，不落库 */
  avatarUrl: string
  /** 可打开的主页链接 */
  profileLink: string
  tierLabel: string
  unitBudgetYuan: number
  talentType: string
  source: 'library' | 'public'
  reason: string
  empty?: boolean
}

export type TalentBudgetSeatSource = {
  talentRows?: Array<{
    platform?: string
    tier?: string
    talentType?: string
    headcount?: number
    unitBudgetYuan?: number
    contentForm?: string
  }>
  budgetLines?: Array<{
    category?: string
    platform?: string
    tier?: string
    headcount?: number
    unitBudgetYuan?: number
    note?: string
  }>
}

/** 与招募向导人数上限一致，避免方案要 36 人时名单被截成 24 人 */
const MAX_SEATS = 80

function asPlatform(raw: string): RegistryTalentLibraryEntry['platform'] {
  if (raw === '小红书' || raw === '大众点评' || raw === '快手' || raw === '微信视频号') return raw
  return '抖音'
}

export function tierKeyFromLabel(tier: string): KolTierKey {
  const s = tier.trim()
  if (/5\+|V5\+|以上/.test(s)) return 'v5plus'
  if (/头|V5|^5|五级/.test(s)) return 'v5'
  if (/腰|V4|^4|四级/.test(s)) return 'v4'
  return 'v3'
}

function isPeopleBudgetLine(category: string): boolean {
  if (/投流|本地推/.test(category)) return false
  return /达人/.test(category)
}

/** 方案里的达人行展开成一个名额一张卡。投流、本地推不进人。 */
export function seatsFromTalentBudget(
  budget: TalentBudgetSeatSource | null | undefined,
  fallbackPlatform = '抖音',
): TalentPlanSeat[] {
  const seats: TalentPlanSeat[] = []
  const rows = Array.isArray(budget?.talentRows) ? budget.talentRows : []
  const lines = Array.isArray(budget?.budgetLines) ? budget.budgetLines : []
  const push = (row: {
    platform?: string
    tier?: string
    talentType?: string
    headcount?: number
    unitBudgetYuan?: number
  }, kind: string) => {
    const count = Math.max(0, Math.floor(Number(row.headcount) || 0))
    if (count < 1) return
    const tierKey = tierKeyFromLabel(String(row.tier || ''))
    const unit = Math.max(0, Math.round(Number(row.unitBudgetYuan) || 0))
    const platform = String(row.platform || fallbackPlatform || '抖音').trim() || '抖音'
    const talentType = String(row.talentType || row.tier || kind).trim()
    for (let i = 0; i < count && seats.length < MAX_SEATS; i += 1) {
      seats.push({
        seatId: `${kind}-${seats.length + 1}`,
        tierKey,
        tierLabel: String(row.tier || '').trim() || kolTierLabel(tierKey),
        unitBudgetYuan: unit,
        talentType,
        platform,
      })
    }
  }
  for (const row of rows) {
    if (/投流/.test(`${row.contentForm || ''}${row.talentType || ''}`)) continue
    push(row, 'row')
  }
  if (seats.length > 0) return seats
  for (const line of lines) {
    const category = String(line.category || '')
    if (!isPeopleBudgetLine(category)) continue
    push({ ...line, talentType: category }, 'line')
  }
  return seats
}

function quoteInBand(quote: number | null, unit: number): boolean {
  if (unit <= 0 || quote == null) return true
  return quote >= unit * 0.7 && quote <= unit * 1.3
}

function categoryHit(entry: RegistryTalentLibraryEntry, talentType: string): boolean {
  const needles = talentType
    .split(/[/、,，|\s]+/u)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
  if (!needles.length) return false
  const blob = [entry.platformNickname || '', ...(entry.accountTags || [])].join(' ')
  return needles.some((n) => blob.includes(n))
}

function publicAvatarUrl(raw: unknown): string {
  const s = String(raw || '').trim()
  if (!/^https:\/\//i.test(s)) return ''
  return s
}

function toCard(
  entry: RegistryTalentLibraryEntry,
  seat: TalentPlanSeat,
  reason: string,
): TalentPlanCard {
  const quote = parseQuotePriceYuan(String(entry.quotePrice || ''))
  return {
    seatId: seat.seatId,
    talentId: String(entry.id || ''),
    nickname: String(entry.platformNickname || entry.platformAccount || '达人'),
    city: String(entry.city || '').trim(),
    platform: String(entry.platform || seat.platform),
    followers: Math.max(0, Math.round(Number(entry.followers) || 0)),
    level: String(entry.douyinSalesLevel || '').trim(),
    quoteYuan: quote,
    tags: (entry.accountTags || []).map((t) => String(t)).filter(Boolean).slice(0, 3),
    avatarUrl: publicAvatarUrl(entry.avatarUrl),
    profileLink: extractProfileLinkUrl(entry.profileLink),
    tierLabel: seat.tierLabel,
    unitBudgetYuan: seat.unitBudgetYuan,
    talentType: seat.talentType,
    source: 'library',
    reason,
  }
}

function emptyCard(seat: TalentPlanSeat): TalentPlanCard {
  return {
    seatId: seat.seatId,
    talentId: '',
    nickname: '',
    city: '',
    platform: seat.platform,
    followers: 0,
    level: '',
    quoteYuan: null,
    tags: [],
    avatarUrl: '',
    profileLink: '',
    tierLabel: seat.tierLabel,
    unitBudgetYuan: seat.unitBudgetYuan,
    talentType: seat.talentType,
    source: 'library',
    reason: '这一档库内没有下一位',
    empty: true,
  }
}

function scoreEntry(
  entry: RegistryTalentLibraryEntry,
  seat: TalentPlanSeat,
  strict: boolean,
): number | null {
  const tier = inferKolTierFromApplicant({
    douyinSalesLevel: entry.douyinSalesLevel,
    followers: entry.followers,
  })
  const quote = parseQuotePriceYuan(String(entry.quotePrice || ''))
  const tierOk = tier === seat.tierKey
  const quoteOk = quoteInBand(quote, seat.unitBudgetYuan)
  if (strict && !tierOk) return null
  if (strict && seat.unitBudgetYuan > 0 && quote != null && !quoteOk) return null
  let score = 0
  if (tierOk) score += 6
  else if (
    (seat.tierKey === 'v5' && tier === 'v5plus') ||
    (seat.tierKey === 'v5plus' && tier === 'v5') ||
    (seat.tierKey === 'v4' && (tier === 'v3' || tier === 'v5'))
  ) {
    score += 2
  }
  if (quoteOk && quote != null) score += 4
  if (categoryHit(entry, seat.talentType)) score += 3
  if (Number(entry.followers) > 0) score += 1
  return score
}

function pickEntry(
  pool: RegistryTalentLibraryEntry[],
  seat: TalentPlanSeat,
  used: Set<string>,
  excluded: Set<string>,
): { entry: RegistryTalentLibraryEntry; relaxed: boolean } | null {
  const candidates = pool.filter((e) => {
    const id = String(e.id || '')
    return id && !used.has(id) && !excluded.has(id) && !isIncompleteTalentLibraryEntry(e)
  })
  const rank = (strict: boolean) => {
    let best: { entry: RegistryTalentLibraryEntry; score: number } | null = null
    for (const entry of candidates) {
      const score = scoreEntry(entry, seat, strict)
      if (score == null) continue
      if (!best || score > best.score) best = { entry, score }
    }
    return best
  }
  const strict = rank(true)
  if (strict) return { entry: strict.entry, relaxed: false }
  const relaxed = rank(false)
  if (relaxed) return { entry: relaxed.entry, relaxed: true }
  return null
}

function reasonFor(
  entry: RegistryTalentLibraryEntry,
  seat: TalentPlanSeat,
  citySource: string,
  relaxed: boolean,
): string {
  const quote = parseQuotePriceYuan(String(entry.quotePrice || ''))
  const bits = [
    citySource === 'city' ? entry.city || '同城' : '全国本地生活参考',
    seat.tierLabel,
  ]
  if (quote != null) bits.push(`报价¥${quote}`)
  const tag = (entry.accountTags || [])[0]
  if (tag) bits.push(String(tag))
  if (relaxed) bits.push('条件已放宽')
  return bits.filter(Boolean).join(' · ')
}

export function seatsFromBudgetHeadcount(params: {
  entries: RegistryTalentLibraryEntry[]
  city: string
  platform: string
  budgetYuan: number
  headcount: number
  talentType: string
}): TalentPlanSeat[] {
  const platform = asPlatform(params.platform)
  const headcount = Math.max(1, Math.min(MAX_SEATS, Math.floor(params.headcount) || 1))
  const alloc = buildNoviceAllocationFromTalentLibrary({
    entries: params.entries,
    city: params.city,
    budgetYuan: Math.max(0, params.budgetYuan),
    targetHeadcount: headcount,
    feeType: 'tier',
    platform,
  })
  const seats: TalentPlanSeat[] = []
  for (const key of ['v3', 'v4', 'v5', 'v5plus'] as const) {
    const count = alloc[key]
    const unit = Math.max(0, Math.round(alloc.unitPrices?.[key] || 0))
    for (let i = 0; i < count && seats.length < MAX_SEATS; i += 1) {
      seats.push({
        seatId: `${key}-${i + 1}`,
        tierKey: key,
        tierLabel: kolTierLabel(key),
        unitBudgetYuan: unit,
        talentType: params.talentType,
        platform,
      })
    }
  }
  return seats
}

export function fillTalentPlanSeats(params: {
  entries: RegistryTalentLibraryEntry[]
  city: string
  platform: string
  seats: TalentPlanSeat[]
  excludedIds?: string[]
}): { cards: TalentPlanCard[]; seats: TalentPlanSeat[]; cityNote: string } {
  const city = params.city.trim()
  const platform = asPlatform(params.platform)
  const resolved = resolveTalentLibraryEntriesForCity({
    entries: params.entries,
    city,
    platform,
  })
  const excluded = new Set((params.excludedIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  const byId = new Map(params.entries.map((e) => [String(e.id || ''), e]))
  const used = new Set<string>()
  const seats = params.seats.slice(0, MAX_SEATS)
  const cityNote =
    resolved.source === 'city'
      ? `按${city || '同城'}达人库推荐`
      : city
        ? `达人库暂无「${city}」同城达人，以下为全国本地生活参考`
        : '未解析到城市，以下为全国本地生活参考'
  const cards = seats.map((seat) => {
    const lockedId = String(seat.lockedTalentId || '').trim()
    const locked = lockedId ? byId.get(lockedId) : undefined
    if (locked && !excluded.has(lockedId) && !isIncompleteTalentLibraryEntry(locked)) {
      used.add(lockedId)
      return toCard(locked, seat, '已留下')
    }
    const pool = resolveTalentLibraryEntriesForCity({
      entries: params.entries,
      city,
      platform: asPlatform(seat.platform || platform),
    }).entries
    const picked = pickEntry(pool, seat, used, excluded)
    if (!picked) return emptyCard(seat)
    const id = String(picked.entry.id || '')
    used.add(id)
    return toCard(
      picked.entry,
      seat,
      reasonFor(picked.entry, seat, resolved.source, picked.relaxed),
    )
  })
  return { cards, seats, cityNote }
}

export function parseTalentPlanRecommendRequest(body: unknown):
  | {
      ok: true
      value: {
        city: string
        platform: string
        talentType: string
        budgetYuan: number
        headcount: number
        seats: TalentPlanSeat[]
        excludedIds: string[]
      }
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'invalid_body' }
  const raw = body as Record<string, unknown>
  const city = String(raw.city ?? '').trim()
  const platform = String(raw.platform ?? '抖音').trim() || '抖音'
  const talentType = String(raw.talentType ?? raw.category ?? '').trim()
  const budgetYuan = Number(raw.budgetYuan)
  const headcount = Number(raw.headcount)
  const excludedIds = Array.isArray(raw.excludedIds)
    ? raw.excludedIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 200)
    : []
  const seatsIn = Array.isArray(raw.seats) ? raw.seats : []
  const seats: TalentPlanSeat[] = []
  for (const item of seatsIn) {
    if (!item || typeof item !== 'object' || seats.length >= MAX_SEATS) continue
    const row = item as Record<string, unknown>
    const tierKey = tierKeyFromLabel(String(row.tierKey || row.tierLabel || row.tier || ''))
    const seatId = String(row.seatId || `seat-${seats.length + 1}`).trim() || `seat-${seats.length + 1}`
    seats.push({
      seatId,
      tierKey:
        row.tierKey === 'v3' || row.tierKey === 'v4' || row.tierKey === 'v5' || row.tierKey === 'v5plus'
          ? row.tierKey
          : tierKey,
      tierLabel: String(row.tierLabel || kolTierLabel(tierKey)),
      unitBudgetYuan: Math.max(0, Math.round(Number(row.unitBudgetYuan) || 0)),
      talentType: String(row.talentType || talentType),
      platform: String(row.platform || platform),
      ...(String(row.lockedTalentId || '').trim()
        ? { lockedTalentId: String(row.lockedTalentId).trim() }
        : {}),
    })
  }
  if (!seats.length && !(Number.isFinite(budgetYuan) && budgetYuan > 0)) {
    return { ok: false, error: 'invalid_budget' }
  }
  return {
    ok: true,
    value: {
      city,
      platform,
      talentType,
      budgetYuan: Number.isFinite(budgetYuan) ? budgetYuan : 0,
      headcount: Number.isFinite(headcount) && headcount > 0 ? Math.min(MAX_SEATS, Math.floor(headcount)) : 0,
      seats,
      excludedIds,
    },
  }
}

export function recommendTalentPlan(params: {
  entries: RegistryTalentLibraryEntry[]
  city: string
  platform: string
  talentType: string
  budgetYuan: number
  headcount: number
  seats: TalentPlanSeat[]
  excludedIds?: string[]
}): { cards: TalentPlanCard[]; seats: TalentPlanSeat[]; cityNote: string } {
  const seats =
    params.seats.length > 0
      ? params.seats
      : seatsFromBudgetHeadcount({
          entries: params.entries,
          city: params.city,
          platform: params.platform,
          budgetYuan: params.budgetYuan,
          headcount: params.headcount > 0 ? params.headcount : Math.max(3, Math.min(12, Math.round(params.budgetYuan / 1200))),
          talentType: params.talentType,
        })
  return fillTalentPlanSeats({
    entries: params.entries,
    city: params.city,
    platform: params.platform,
    seats,
    excludedIds: params.excludedIds,
  })
}
