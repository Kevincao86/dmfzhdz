import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'
import {
  formatCityTierBandsSummary,
  resolveCityKolTierBands,
  type CityKolTierBands,
  type KolTierBand,
} from '../lib/recruitmentCityTierPricing'
import { readMerchantSession } from '../lib/merchantSession'
import {
  allocateTierCountsByBudget,
  computeTalentLibraryTierAverages,
  formatTierAvgSummary,
} from '../lib/talentLibraryTierPricing'
import { postDouyinGoodsAiAssist, type AiModelId } from './douyinAiAssistApi'
import { resolveTextAiModelForRequest } from './merchantAiModelStorage'

import type { KolTierStrategy } from '../lib/opsRegistryTypes'

export type CityTierBandsSource = 'ai' | 'static'

/** 达人档位分配策略（影响 AI / 离线估算权重） */
export type { KolTierStrategy }

export type NoviceAllocation = {
  v3: number
  v4: number
  v5: number
  v5plus: number
  notes?: string
  costHint?: string
  source: 'library' | 'ai' | 'fallback'
}

export function kolTierStrategyLabel(s: KolTierStrategy): string {
  if (s === 'more_v3') return 'V3 多一些（V4 / V5 相对较少）'
  if (s === 'more_v4') return 'V4 多一些（V3 / V5 相对较少）'
  return 'V5 及 V5 以上多一些（V3 / V4 相对较少）'
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(n)))
}

/** 离线估算：按目标人数与费用模式拆分档位（AI 不可用时使用） */
export function fallbackNoviceKolAllocation(
  budgetYuan: number,
  targetHeadcount: number,
  feeType: 'tier' | 'fixed',
  cityForHint?: string,
): NoviceAllocation {
  const b = Number.isFinite(budgetYuan) && budgetYuan > 0 ? budgetYuan : 0
  const totalPeople = clampInt(Number(targetHeadcount) || 0, 1, 200)
  if (feeType === 'fixed') {
    const per = totalPeople > 0 ? Math.round(b / totalPeople) : 0
    return {
      v3: 0,
      v4: 0,
      v5: 0,
      v5plus: totalPeople,
      notes: '当前为离线规则估算（一口价模式）。',
      costHint: `总预算约 ¥${b.toLocaleString('zh-CN')}，招募 ${totalPeople} 人，人均约 ¥${per}/人（仅供参考）。`,
      source: 'fallback',
    }
  }
  const bands = cityForHint ? resolveCityKolTierBands(cityForHint) : resolveCityKolTierBands('')
  const ctx = computeTalentLibraryTierAverages({ entries: [], city: cityForHint ?? '', platform: '抖音' })
  const tierPrices = {
    v3: ctx.tierAvgs.v3.avgYuan,
    v4: ctx.tierAvgs.v4.avgYuan,
    v5: ctx.tierAvgs.v5.avgYuan,
    v5plus: ctx.tierAvgs.v5plus.avgYuan,
  }
  const alloc = allocateTierCountsByBudget({
    budgetYuan: b,
    targetHeadcount: totalPeople,
    tierPrices,
  })
  const tierHint = formatCityTierBandsSummary(bands)
  const avgLine = formatTierAvgSummary(ctx)
  const budgetNote = alloc.withinBudget
    ? `预估总成本约 ¥${alloc.estimatedCostYuan.toLocaleString('zh-CN')}`
    : `预估总成本约 ¥${alloc.estimatedCostYuan.toLocaleString('zh-CN')}（高于预算，已尽量降档）`
  return {
    v3: alloc.v3,
    v4: alloc.v4,
    v5: alloc.v5,
    v5plus: alloc.v5plus,
    notes: '达人库接口不可用，已按城市档位参考价离线估算。',
    costHint: `${avgLine}。目标 ${totalPeople} 人；${budgetNote}。${tierHint}`,
    source: 'fallback',
  }
}

function parseTierBandObj(raw: unknown): KolTierBand | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const min = typeof o.min === 'number' ? o.min : Number(o.min)
  const maxRaw = o.max
  const max =
    maxRaw === null || maxRaw === undefined || maxRaw === ''
      ? null
      : typeof maxRaw === 'number'
        ? maxRaw
        : Number(maxRaw)
  if (!Number.isFinite(min) || min < 0) return null
  if (max !== null && (!Number.isFinite(max) || max < min)) return null
  return { min: Math.floor(min), max: max === null ? null : Math.floor(max) }
}

function parseCityTierBandsJson(text: string, cityInput: string): CityKolTierBands | null {
  const t = text.trim()
  const tryObj = (s: string): Record<string, unknown> | null => {
    try {
      const j = JSON.parse(s) as unknown
      return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  let o = tryObj(t)
  if (!o) {
    const m = t.match(/\{[\s\S]*\}/)
    if (m) o = tryObj(m[0])
  }
  if (!o) return null
  const v3 = parseTierBandObj(o.v3)
  const v4 = parseTierBandObj(o.v4)
  const v5 = parseTierBandObj(o.v5)
  const v5plus = parseTierBandObj(o.v5plus ?? o.v5_plus ?? o['v5+'])
  if (!v3 || !v4 || !v5 || !v5plus) return null
  const displayCity = cityInput.trim() || '当前城市'
  return {
    cityKey: displayCity.replace(/市$/u, '').toLowerCase(),
    displayCity,
    v3,
    v4,
    v5,
    v5plus,
  }
}

/**
 * 由文本大模型按城市（及可选行业）估算 V3–V5+ 单人探店参考成本带（元/人次）。
 */
export async function requestCityKolTierBandsAi(
  city: string,
  industry?: string,
): Promise<CityKolTierBands | null> {
  const c = city.trim()
  if (!c) return null
  const model = resolveTextAiModelForRequest() as AiModelId
  const ind = (industry ?? '').trim() || '本地生活'
  const titleDraft = `你是本地生活达人探店成本顾问。请根据「${c}」${ind !== '本地生活' ? `、行业「${ind}」` : ''}的抖音团购探店撮合行情，给出各带货等级达人单次探店/条内容的参考成本区间（人民币元/人次，非承诺报价）。

硬性要求：
1. 仅输出一个 JSON 对象，不要 Markdown、不要代码围栏。
2. 字段：v3、v4、v5、v5plus，每个为对象 { "min": 非负整数, "max": 正整数或 null }；v5plus 的 max 可为 null 表示「以上」。
3. 区间应递增：V3 通常最低，V5+ 最高；相邻档位可衔接，符合该城市一线/新一线/二线等量级。
4. 可选 notes 一句话说明假设。

请输出 JSON。`

  const r = await postDouyinGoodsAiAssist({
    model,
    action: 'operation_article',
    product_name: '同城达人档位参考成本',
    title_draft: titleDraft,
  })
  if (!r.ok || !r.description) return null
  return parseCityTierBandsJson(r.description, c)
}

/** AI 估算城市档位；失败则回退静态表 */
export async function resolveCityKolTierBandsSmart(params: {
  city: string
  industry?: string
}): Promise<{ bands: CityKolTierBands; source: CityTierBandsSource }> {
  const city = params.city.trim()
  if (!city) {
    return { bands: resolveCityKolTierBands(city), source: 'static' }
  }
  try {
    const ai = await requestCityKolTierBandsAi(city, params.industry)
    if (ai) return { bands: ai, source: 'ai' }
  } catch {
    /* ignore */
  }
  return { bands: resolveCityKolTierBands(city), source: 'static' }
}

function parseAllocationJson(text: string): Omit<NoviceAllocation, 'source'> | null {
  const t = text.trim()
  const tryObj = (s: string): Record<string, unknown> | null => {
    try {
      const j = JSON.parse(s) as unknown
      return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  let o = tryObj(t)
  if (!o) {
    const m = t.match(/\{[\s\S]*\}/)
    if (m) o = tryObj(m[0])
  }
  if (!o) return null
  const num = (k: string, alt: string[]) => {
    const keys = [k, ...alt]
    for (const key of keys) {
      const v = o![key]
      if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v))
      if (typeof v === 'string' && v.trim()) {
        const n = Number.parseInt(v.replace(/\D/g, ''), 10)
        if (Number.isFinite(n)) return Math.max(0, n)
      }
    }
    return null
  }
  const v3 = num('v3', ['V3', 'tier_v3'])
  const v4 = num('v4', ['V4', 'tier_v4'])
  const v5 = num('v5', ['V5', 'tier_v5'])
  const v5plus = num('v5plus', ['v5_plus', 'V5+', 'v5以上', 'tier_v5plus'])
  if (v3 === null || v4 === null || v5 === null || v5plus === null) return null
  const notes = typeof o.notes === 'string' ? o.notes : typeof o.summary === 'string' ? o.summary : undefined
  const costHint =
    typeof o.cost_hint === 'string'
      ? o.cost_hint
      : typeof o.costHint === 'string'
        ? o.costHint
        : undefined
  return { v3, v4, v5, v5plus, notes, costHint }
}

/**
 * 调用已绑定文本模型，结合城市 / 行业 / 套餐 / 预算与策略输出 JSON 档位人数。
 * 失败或未配置时由上层改用 fallback。
 */
export async function requestNoviceKolAllocationAi(params: {
  city: string
  industry: string
  packageNote: string
  budgetYuan: number
  targetHeadcount: number
  feeType: 'tier' | 'fixed'
  kolCommissionPct: number
  cityTierBands?: CityKolTierBands
}): Promise<NoviceAllocation | null> {
  const model = resolveTextAiModelForRequest() as AiModelId
  const bands = params.cityTierBands ?? resolveCityKolTierBands(params.city)
  const tierDoc = formatCityTierBandsSummary(bands)
  const comm = Math.max(0, Math.min(80, Math.round(Number(params.kolCommissionPct) || 0)))
  const feeZh = params.feeType === 'fixed' ? '一口价（人均成本优先）' : '阶梯档位（按 V3–V5+ 拆分）'
  const titleDraft = `你是本地生活达人招募成本顾问。根据城市达人撮合的行情，为商家做一次「档位人数」分配建议。

硬性要求：
1. 仅输出一个 JSON 对象，不要 Markdown、不要代码围栏、不要解释正文外的文字。
2. 字段必须为：v3、v4、v5、v5plus（均为非负整数），可选 notes（一句话）、cost_hint（一句话说明成本假设）。
3. v3+v4+v5+v5plus 必须等于目标招募人数 ${params.targetHeadcount}；总成本量级须与总预算 ¥${params.budgetYuan} 相符。
4. 费用模式：${feeZh}
5. 须参考下列同城档位成本带，人数分配与预算不要明显违背该成本结构。
6. 商家填写的达人佣金（占售价/结算口径的百分比，仅作理解，勿写入 JSON）：${comm}%（本地生活纯佣金常见 1～5%，默认 3%；勿按电商 CPS 理解）

同城档位单人参考成本带（元/人次，非承诺报价）：
${tierDoc}

输入：
- 城市：${params.city.trim() || '未填'}
- 行业：${params.industry.trim()}
- 套餐/项目说明：${params.packageNote.trim().slice(0, 800)}
- 总预算（元）：${params.budgetYuan}
- 目标招募人数：${params.targetHeadcount}

请输出 JSON。`

  const r = await postDouyinGoodsAiAssist({
    model,
    action: 'operation_article',
    product_name: '达人档位分配',
    title_draft: titleDraft,
  })
  if (!r.ok || !r.description) return null
  const parsed = parseAllocationJson(r.description)
  if (!parsed) return null
  const sum = parsed.v3 + parsed.v4 + parsed.v5 + parsed.v5plus
  if (sum <= 0) return null
  return { ...parsed, source: 'ai' }
}

/** 小红书：按预算估算达人数（无抖音带货等级档位） */
export function fallbackXiaohongshuNoviceAllocation(budgetYuan: number): NoviceAllocation {
  const b = Number.isFinite(budgetYuan) && budgetYuan > 0 ? budgetYuan : 0
  const totalPeople = clampInt(b / 900, 3, 40)
  return {
    v3: 0,
    v4: 0,
    v5: 0,
    v5plus: totalPeople,
    notes: '小红书招募按预算与同城笔记达人行情估算人数（无抖音 V 档位）。',
    costHint: `按总预算约 ¥${b.toLocaleString('zh-CN')}，建议约 ${totalPeople} 位小红书达人（仅供参考）。`,
    source: 'fallback',
  }
}

function libraryAllocationAuthHeaders(): HeadersInit {
  const token = readMerchantSession('meoo_douyin_merchant_token')
  const h: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

/** 经 ECS 读取达人库各档均价并分配人数（主路径） */
export async function requestNoviceKolAllocationFromLibrary(params: {
  city: string
  budgetYuan: number
  targetHeadcount: number
  feeType: 'tier' | 'fixed'
  platform?: string
}): Promise<NoviceAllocation | null> {
  const payload = JSON.stringify({
    city: params.city.trim(),
    budgetYuan: params.budgetYuan,
    targetHeadcount: params.targetHeadcount,
    feeType: params.feeType,
    platform: params.platform ?? '抖音',
  })
  const headers = libraryAllocationAuthHeaders()
  for (const url of merchantApiFetchUrls('/api/meoo-ops-novice-kol-allocation')) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body: payload })
      if (!res.ok) continue
      const j = (await res.json()) as {
        ok?: boolean
        allocation?: NoviceAllocation
      }
      if (!j.ok || !j.allocation) continue
      const a = j.allocation
      const sum = a.v3 + a.v4 + a.v5 + a.v5plus
      if (sum <= 0) continue
      return {
        v3: a.v3,
        v4: a.v4,
        v5: a.v5,
        v5plus: a.v5plus,
        notes: a.notes,
        costHint: a.costHint,
        source: a.source === 'library' ? 'library' : 'fallback',
      }
    } catch {
      /* try next base */
    }
  }
  return null
}

/** 达人库均价 + 离线兜底（不再依赖 LLM 拆档） */
export async function generateNoviceKolAllocation(params: {
  city: string
  industry: string
  packageNote: string
  budgetYuan: number
  targetHeadcount: number
  feeType: 'tier' | 'fixed'
  kolCommissionPct: number
  cityTierBands?: CityKolTierBands
}): Promise<NoviceAllocation> {
  const headcount = clampInt(Number(params.targetHeadcount) || 0, 1, 200)
  try {
    const fromLibrary = await requestNoviceKolAllocationFromLibrary({
      city: params.city,
      budgetYuan: params.budgetYuan,
      targetHeadcount: headcount,
      feeType: params.feeType,
      platform: '抖音',
    })
    if (fromLibrary) {
      const sum = fromLibrary.v3 + fromLibrary.v4 + fromLibrary.v5 + fromLibrary.v5plus
      if (sum === headcount || params.feeType === 'fixed') return fromLibrary
    }
  } catch {
    /* ignore */
  }
  return fallbackNoviceKolAllocation(params.budgetYuan, headcount, params.feeType, params.city)
}
