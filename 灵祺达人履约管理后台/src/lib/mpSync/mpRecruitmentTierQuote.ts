/** 等级/粉丝阶梯：每档 fixed | self_quote，报名与结算共用 */

export const TIER_PRICE_MODES = [
  { id: 'fixed', label: '固定价' },
  { id: 'self_quote', label: '自报价' },
] as const

export type TierPriceMode = 'fixed' | 'self_quote'

export type LevelTierRow = {
  id: string
  levels: string[]
  levelsText: string
  price: string
  priceMode?: TierPriceMode
  selfQuoteMin?: string
  selfQuoteMax?: string
}

export type FansTierRow = {
  id: string
  fansRange: string
  fansRangeText: string
  price: string
  priceMode?: TierPriceMode
  selfQuoteMin?: string
  selfQuoteMax?: string
}

function parseYuan(raw: unknown): number {
  const s = String(raw ?? '').replace(/[,¥￥]/g, '').trim()
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function formatYuan(yuan: number): string {
  if (!Number.isFinite(yuan) || yuan <= 0) return ''
  return String(yuan % 1 === 0 ? yuan : Number(yuan.toFixed(2)))
}

export function normalizeTierPriceMode(raw: unknown): TierPriceMode {
  return String(raw || '').trim() === 'self_quote' ? 'self_quote' : 'fixed'
}

export function normalizeLevelTier(tier: unknown): LevelTierRow {
  if (!tier || typeof tier !== 'object') {
    return { id: '', levels: [], levelsText: '请选择等级', price: '', priceMode: 'fixed' }
  }
  const t = tier as LevelTierRow
  return {
    ...t,
    priceMode: normalizeTierPriceMode(t.priceMode),
    price: t.price != null ? String(t.price) : '',
  }
}

export function normalizeFansTier(tier: unknown): FansTierRow {
  if (!tier || typeof tier !== 'object') {
    return {
      id: '',
      fansRange: '',
      fansRangeText: '请选择粉丝档位',
      price: '',
      priceMode: 'fixed',
    }
  }
  const t = tier as FansTierRow
  return {
    ...t,
    priceMode: normalizeTierPriceMode(t.priceMode),
    price: t.price != null ? String(t.price) : '',
  }
}

function applicantKolLevel(applicant: Record<string, unknown>): string {
  return String(
    applicant.kolTier || applicant.douyinSalesLevel || applicant.displaySalesLevel || '',
  ).trim()
}

function normalizeKolLevelKey(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (/暂无|无等级|不限/i.test(s)) return ''
  const m = s.match(/lv?\s*(\d+)/i)
  if (m) return `lv${Number(m[1])}`
  return s.toLowerCase()
}

function tierLevelLabels(t: LevelTierRow): string[] {
  const out: string[] = []
  if (Array.isArray(t.levels)) out.push(...t.levels.map((l) => String(l)))
  const txt = String(t.levelsText || '').trim()
  if (txt) out.push(txt)
  return out.filter(Boolean)
}

function levelMatches(kol: string, levelLabel: string): boolean {
  const ka = normalizeKolLevelKey(kol)
  const kb = normalizeKolLevelKey(levelLabel)
  if (ka && kb && ka === kb) return true
  const l = String(levelLabel || '').trim().toLowerCase()
  const k = String(kol || '').trim().toLowerCase()
  if (!kol || !l) return false
  return l.includes(k) || k.includes(l)
}

export function findMatchingLevelTier(
  meta: Record<string, unknown>,
  applicant: Record<string, unknown>,
): LevelTierRow | null {
  const tiers = Array.isArray(meta.levelTiers) ? meta.levelTiers : []
  const kol = applicantKolLevel(applicant)
  for (const raw of tiers) {
    const t = normalizeLevelTier(raw)
    const levels = tierLevelLabels(t)
    if (kol && levels.some((l) => levelMatches(kol, l))) return t
  }
  if (tiers.length === 1 && tiers[0]) return normalizeLevelTier(tiers[0])
  return null
}

function fansInRange(fans: number, range: string): boolean {
  const r = String(range || '').trim()
  if (!r) return false
  if (r.includes('以下')) {
    const m = r.match(/(\d+)/)
    if (m && fans < Number(m[1])) return true
  }
  const m = r.match(/(\d+)\s*[-~～]\s*(\d+)/)
  if (m) {
    const lo = Number(m[1])
    const hi = Number(m[2])
    return fans >= lo && fans <= hi
  }
  const ge = r.match(/(?:≥|以上)\s*(\d+)/)
  if (ge && fans >= Number(ge[1])) return true
  if (r.includes('以上')) {
    const m2 = r.match(/(\d+)/)
    if (m2 && fans >= Number(m2[1])) return true
  }
  return false
}

export function findMatchingFansTier(
  meta: Record<string, unknown>,
  applicant: Record<string, unknown>,
): FansTierRow | null {
  const tiers = Array.isArray(meta.fansTiers) ? meta.fansTiers : []
  const fans = Number(applicant.fans || applicant.followers || 0)
  for (const raw of tiers) {
    const t = normalizeFansTier(raw)
    if (fansInRange(fans, t.fansRange)) return t
  }
  if (tiers.length === 1 && tiers[0]) return normalizeFansTier(tiers[0])
  return null
}

export function findMatchingTier(
  meta: Record<string, unknown>,
  applicant: Record<string, unknown>,
): LevelTierRow | FansTierRow | null {
  const feeTypeId = String(meta.feeTypeId || '').trim()
  if (feeTypeId === 'level_tier') return findMatchingLevelTier(meta, applicant)
  if (feeTypeId === 'fans_tier') return findMatchingFansTier(meta, applicant)
  return null
}

export function resolveTierSettlementYuan(
  tier: LevelTierRow | FansTierRow | null,
  applicant: Record<string, unknown>,
  meta: Record<string, unknown>,
): number {
  if (!tier) return 0
  if (normalizeTierPriceMode(tier.priceMode) === 'self_quote') {
    const q = parseYuan(applicant.quotePrice)
    if (q > 0) return q
    return (
      parseYuan(tier.selfQuoteMin) ||
      parseYuan(tier.selfQuoteMax) ||
      parseYuan(meta.selfQuoteMin) ||
      parseYuan(meta.selfQuoteMax)
    )
  }
  return parseYuan(tier.price)
}

export function resolveTierDisplayQuote(
  tier: LevelTierRow | FansTierRow | null,
  applicant: Record<string, unknown>,
  meta: Record<string, unknown>,
): string {
  if (!tier) return ''
  if (normalizeTierPriceMode(tier.priceMode) === 'self_quote') {
    const q = parseYuan(applicant.quotePrice)
    if (q > 0) return formatYuan(q)
    const min = parseYuan(tier.selfQuoteMin) || parseYuan(meta.selfQuoteMin)
    const max = parseYuan(tier.selfQuoteMax) || parseYuan(meta.selfQuoteMax)
    if (min > 0 && max > 0 && min !== max) return `${min}-${max}`
    if (min > 0) return String(min)
    return '自报价'
  }
  const p = parseYuan(tier.price)
  if (p === 0) return '置换'
  return formatYuan(p)
}

export function matchLevelTierSettlementYuan(
  meta: Record<string, unknown>,
  applicant: Record<string, unknown>,
): number {
  return resolveTierSettlementYuan(findMatchingLevelTier(meta, applicant), applicant, meta)
}

export function matchFansTierSettlementYuan(
  meta: Record<string, unknown>,
  applicant: Record<string, unknown>,
): number {
  return resolveTierSettlementYuan(findMatchingFansTier(meta, applicant), applicant, meta)
}

/** 商单是否含任一档「自报价」阶梯（或整单自报价） */
export function orderMetaHasAnyTierSelfQuote(meta: Record<string, unknown> | null | undefined): boolean {
  const m = meta && typeof meta === 'object' ? meta : {}
  const feeTypeId = String(m.feeTypeId || '').trim()
  if (feeTypeId === 'self_quote') return true
  const tiers =
    feeTypeId === 'fans_tier'
      ? Array.isArray(m.fansTiers)
        ? m.fansTiers
        : []
      : Array.isArray(m.levelTiers)
        ? m.levelTiers
        : []
  return tiers.some(
    (raw) => normalizeTierPriceMode((raw as { priceMode?: string })?.priceMode) === 'self_quote',
  )
}

export function applicantNeedsSelfQuoteForApply(
  meta: Record<string, unknown>,
  draft: Record<string, unknown>,
): boolean {
  const feeTypeId = String(meta.feeTypeId || '').trim()
  if (feeTypeId === 'self_quote') return true
  const tier = findMatchingTier(meta, draft)
  return tier ? normalizeTierPriceMode(tier.priceMode) === 'self_quote' : false
}

export function applyRowRequiredForTierMeta(
  role: string,
  meta: Record<string, unknown> | null | undefined,
): boolean {
  const feeTypeId = String(meta?.feeTypeId || '').trim()
  if (feeTypeId === 'level_tier' && role === 'douyinSalesLevel') return true
  if (feeTypeId === 'fans_tier' && role === 'followers') return true
  return false
}

type TierApplyRow = {
  id?: string
  role?: string | null
  required?: boolean
  type?: string
  bindKey?: string
  displayLabel?: string
  isPicker?: boolean
  placeholder?: string
  [key: string]: unknown
}

/** 阶梯商单：报名模版未含带货等级/报价时自动补字段 */
export function ensureTierApplyRows<T extends TierApplyRow>(
  rows: T[],
  orderMeta: Record<string, unknown> | null | undefined,
  platform: string,
): T[] {
  if (!orderMeta || typeof orderMeta !== 'object') return rows
  const feeTypeId = String(orderMeta.feeTypeId || '').trim()
  if (feeTypeId !== 'level_tier' && feeTypeId !== 'fans_tier' && feeTypeId !== 'self_quote') {
    return rows
  }
  const out = [...rows]
  if (feeTypeId === 'level_tier' && platform === '抖音' && !out.some((r) => r.role === 'douyinSalesLevel')) {
    const linkIdx = out.findIndex((r) => r.role === 'profileLink')
    const insertAt = linkIdx >= 0 ? linkIdx + 1 : out.length
    out.splice(insertAt, 0, {
      id: 'tier-dylevel-auto',
      role: 'douyinSalesLevel',
      required: true,
      type: 'picker',
      bindKey: 'douyinSalesLevel',
      displayLabel: '抖音带货等级',
      isPicker: true,
    } as T)
  }
  const needsQuoteSlot =
    feeTypeId === 'self_quote' || orderMetaHasAnyTierSelfQuote(orderMeta)
  if (needsQuoteSlot && !out.some((r) => r.role === 'quotePrice')) {
    out.push({
      id: 'tier-quote-auto',
      role: 'quotePrice',
      required: false,
      type: 'digit',
      bindKey: 'quotePrice',
      displayLabel: '报价（元）',
      placeholder: '请填写您的报价',
    } as T)
  }
  return out
}

export function applicantTierFixedPriceHint(
  meta: Record<string, unknown>,
  draft: Record<string, unknown>,
): string {
  const feeTypeId = String(meta.feeTypeId || '').trim()
  if (feeTypeId !== 'level_tier' && feeTypeId !== 'fans_tier') return ''
  const tier = findMatchingTier(meta, draft)
  if (!tier || normalizeTierPriceMode(tier.priceMode) !== 'fixed') return ''
  const p = parseYuan(tier.price)
  if (p === 0) return '本档酬劳：置换'
  const label =
    feeTypeId === 'level_tier'
      ? (Array.isArray((tier as LevelTierRow).levels) ? (tier as LevelTierRow).levels.join('、') : '') ||
        applicantKolLevel(draft)
      : String((tier as FansTierRow).fansRange || (tier as FansTierRow).fansRangeText || '').trim()
  return label ? `本单 ${label} 酬劳 ¥${formatYuan(p)}` : `本档酬劳 ¥${formatYuan(p)}`
}

export function validateTierApply(
  meta: Record<string, unknown>,
  draft: Record<string, unknown>,
): string | null {
  const feeTypeId = String(meta.feeTypeId || '').trim()
  if (feeTypeId !== 'level_tier' && feeTypeId !== 'fans_tier') return null
  const tier = findMatchingTier(meta, draft)
  if (!tier) {
    if (feeTypeId === 'level_tier') {
      const kol = applicantKolLevel(draft)
      return kol ? '您的带货等级不在本单阶梯范围内' : '请选择带货等级以匹配本单酬劳'
    }
    return '您的粉丝量不在本单阶梯范围内'
  }
  if (normalizeTierPriceMode(tier.priceMode) === 'self_quote') {
    const q = parseYuan(draft.quotePrice)
    if (q <= 0) return '请填写您的报价（元）'
  }
  return null
}

export function formatTierPriceSummary(tier: unknown, kind: 'level' | 'fans'): string {
  if (kind === 'fans') {
    const t = normalizeFansTier(tier)
    if (normalizeTierPriceMode(t.priceMode) === 'self_quote') {
      return `${t.fansRange || t.fansRangeText || '—'} 自报价`
    }
    const p = parseYuan(t.price)
    const priceText = p === 0 ? '置换' : `¥${formatYuan(p)}`
    return `${t.fansRange || t.fansRangeText || '—'} ${priceText}`
  }
  const t = normalizeLevelTier(tier)
  if (normalizeTierPriceMode(t.priceMode) === 'self_quote') {
    const lv = (t.levels || []).join('+') || '—'
    return `${lv} 自报价`
  }
  const p = parseYuan(t.price)
  const priceText = p === 0 ? '置换' : `¥${formatYuan(p)}`
  const lv = (t.levels || []).join('+') || '—'
  return `${lv} ${priceText}`
}

export function buildTierBudgetDetailText(meta: Record<string, unknown>): string | null {
  const feeTypeId = String(meta.feeTypeId || '').trim()
  const cps = String(meta.cpsPercent || '').trim()
  const prefix = cps ? `CPS ${cps}% · ` : ''
  if (feeTypeId === 'level_tier' && Array.isArray(meta.levelTiers) && meta.levelTiers.length) {
    const parts = meta.levelTiers.map((t) => formatTierPriceSummary(t, 'level'))
    return `${prefix}等级阶梯 ${parts.join(' / ')}`
  }
  if (feeTypeId === 'fans_tier' && Array.isArray(meta.fansTiers) && meta.fansTiers.length) {
    const parts = meta.fansTiers.map((t) => formatTierPriceSummary(t, 'fans'))
    return `${prefix}粉丝阶梯 ${parts.join(' / ')}`
  }
  return null
}

/** 已发布招募说明中阶梯自报价可能被存成「Lv6 · ¥」，展示时按 meta 纠正 */
export function patchRecruitmentInfoTierQuotes(
  text: string,
  meta: Record<string, unknown> | null | undefined,
): string {
  if (!text || !meta || typeof meta !== 'object') return text
  if (!orderMetaHasAnyTierSelfQuote(meta)) return text
  const feeTypeId = String(meta.feeTypeId || '').trim()
  const lines = String(text).split('\n')
  let changed = false

  const patchLines = (tiers: unknown[], kind: 'level' | 'fans') => {
    for (let i = 0; i < tiers.length; i++) {
      const summary = formatTierPriceSummary(tiers[i], kind)
      const tierNo = i + 1
      for (let li = 0; li < lines.length; li++) {
        const m = lines[li].trim().match(/^阶梯(\d+)[:：]/)
        if (m && Number(m[1]) === tierNo) {
          const next = `阶梯${tierNo}：${summary}`
          if (lines[li] !== next) {
            lines[li] = next
            changed = true
          }
        }
      }
    }
    const budget = buildTierBudgetDetailText(meta)
    if (budget) {
      for (let li = 0; li < lines.length; li++) {
        if (/^酬劳摘要[:：]/.test(lines[li].trim())) {
          const next = `酬劳摘要：${budget}`
          if (lines[li] !== next) {
            lines[li] = next
            changed = true
          }
        }
      }
    }
  }

  if (feeTypeId === 'level_tier' && Array.isArray(meta.levelTiers) && meta.levelTiers.length) {
    patchLines(meta.levelTiers, 'level')
  } else if (feeTypeId === 'fans_tier' && Array.isArray(meta.fansTiers) && meta.fansTiers.length) {
    patchLines(meta.fansTiers, 'fans')
  }

  return changed ? lines.join('\n') : text
}

export function validateTierPublish(
  tier: unknown,
  index: number,
  kind: 'level' | 'fans',
): string | null {
  const n = index + 1
  if (kind === 'level') {
    const t = normalizeLevelTier(tier)
    if (!(t.levels || []).length) return `请设置第 ${n} 个阶梯的达人等级`
  } else {
    const t = normalizeFansTier(tier)
    if (!t.fansRange) return `请设置第 ${n} 个阶梯的粉丝档位`
  }
  const t = kind === 'fans' ? normalizeFansTier(tier) : normalizeLevelTier(tier)
  if (normalizeTierPriceMode(t.priceMode) === 'fixed') {
    if (String(t.price ?? '').trim() === '') return `请填写第 ${n} 个阶梯的固定价格`
  }
  return null
}

export { parseYuan, formatYuan }
