import type { AIProvider } from '../src/services/ai/types.js'
import { routeAiChat } from './aiGateway/chatRouter.js'
import {
  clampMatchScoreByFacts,
  clampTalentScoreForOrders,
  fallbackOrderHighlightTag,
  sanitizeAiOrderTag,
  type OrderMatchPayload,
  type TalentMatchProfile,
} from '../src/lib/mpRecruitmentMatchShared.js'

export type MpRecruitmentAiOrderInput = {
  id: string
  title?: string
  platform?: string
  region?: string
  category?: string
  budgetText?: string
  fansRequirement?: string
  hall?: string
  urgent?: boolean
  isIce?: boolean
  summary?: string
  recruitTarget?: string
  priceAmount?: number
  talentTags?: string[]
  infoSummary?: string
  recruitDetail?: string
}

export type MpRecruitmentAiTalentInput = {
  id?: string
  workIdentity?: string
  role?: string
  roleLabel?: string
  recruitTarget?: string
  platform?: string
  nickname?: string
  followers?: number | string
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
  applicationHabits?: Record<string, unknown>
}

const MATCH_SCORE_GUIDE = `评分（0-100，须与事实一致）：
- 招募对象不符（达人/拍摄/剪辑）总分 ≤28
- 平台不同总分 ≤42；跨城且类目无关 30-48
- 同城 + 平台一致 + 粉丝/等级达标 + 标签或类目契合：应给 85-95（高匹配）
- 同城 + 平台一致 + 粉丝达标：应给 78-88
- 同省 + 平台一致 + 部分标签：65-78
- 全国商单 + 平台一致：55-72
禁止在「城市、平台、标签、等级均符合」时仍给 50 分左右的中等分。`

function compactTalent(t: MpRecruitmentAiTalentInput): Record<string, unknown> {
  return {
    id: String(t.id ?? '').trim(),
    workIdentity: t.workIdentity || t.role || 'talent',
    roleLabel: t.roleLabel || '',
    recruitTarget: t.recruitTarget || t.workIdentity || 'talent',
    platform: t.platform || '',
    nickname: (t.nickname || '').slice(0, 32),
    followers: t.followers ?? '',
    region: t.region || [t.province, t.city].filter(Boolean).join(' '),
    accountTags: Array.isArray(t.accountTags) ? t.accountTags.slice(0, 8) : [],
    douyinSalesLevel: t.douyinSalesLevel || '',
    quotePrice: t.quotePrice || '',
    gender: t.gender || '',
    quality: t.quality || '',
    tags: Array.isArray(t.tags) ? t.tags.slice(0, 8) : [],
    supplierSkills: Array.isArray(t.supplierSkills) ? t.supplierSkills.slice(0, 8) : [],
    applicationHabits: t.applicationHabits || null,
  }
}

function compactPrOrder(o: MpRecruitmentAiOrderInput) {
  return {
    ...compactOrder(o),
    talentTags: Array.isArray(o.talentTags) ? o.talentTags : [],
    info: String(o.infoSummary || o.summary || '').slice(0, 400),
    recruitDetail: String(o.recruitDetail || '').slice(0, 200),
  }
}

function hasKey(env: Record<string, string>, provider: AIProvider): boolean {
  if (provider === 'doubao') {
    return Boolean((env.MERCHANT_AI_DOUBAO_KEY ?? env.ARK_API_KEY ?? '').trim())
  }
  if (provider === 'qwen') {
    return Boolean((env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim())
  }
  if (provider === 'minimax') {
    return Boolean((env.MERCHANT_AI_MINIMAX_KEY ?? env.MINIMAX_API_KEY ?? '').trim())
  }
  return false
}

function providerChain(env: Record<string, string>, preferred?: string): AIProvider[] {
  const chain: AIProvider[] = []
  const add = (p: AIProvider) => {
    if (hasKey(env, p) && !chain.includes(p)) chain.push(p)
  }
  const want = String(preferred || env.MERCHANT_MP_AI_PROVIDER || 'doubao').trim() as AIProvider
  add(want)
  for (const p of ['doubao', 'qwen', 'minimax'] as AIProvider[]) add(p)
  return chain
}

function isRetryableAiError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
  return /429|quota|rate.?limit|余额|不足|insufficient|exhausted|limit exceeded|too many|resource|额度|欠费|over.?limit|capacity/.test(
    msg,
  )
}

function compactOrder(o: MpRecruitmentAiOrderInput): Record<string, unknown> {
  return {
    id: o.id,
    title: (o.title || '').slice(0, 80),
    platform: o.platform || '',
    region: o.region || '',
    category: o.category || '',
    budget: o.budgetText || '',
    priceAmount: o.priceAmount ?? 0,
    fans: o.fansRequirement || '',
    recruitTarget: o.recruitTarget || 'talent',
    hall: o.hall || (o.isIce ? 'ice' : o.urgent ? 'urgent' : 'normal'),
    summary: String(o.summary || '').slice(0, 220),
  }
}

function extractJsonArray(text: string): unknown[] {
  const raw = String(text || '').trim()
  if (!raw) return []
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : raw
  try {
    const j = JSON.parse(candidate) as unknown
    if (Array.isArray(j)) return j
    if ( j && typeof j === 'object') {
      const o = j as Record<string, unknown>
      if (Array.isArray(o.items)) return o.items
      if (Array.isArray(o.tags)) return o.tags
      if (Array.isArray(o.results)) return o.results
    }
  } catch {
    /* fall through */
  }
  const m = raw.match(/\[[\s\S]*\]/)
  if (m) {
    try {
      const j = JSON.parse(m[0]) as unknown
      if (Array.isArray(j)) return j
    } catch {
      /* ignore */
    }
  }
  return []
}

function normalizeTagItem(x: unknown): { id: string; tag: string; tone: string } | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const id = String(o.id ?? '').trim()
  const tag = String(o.tag ?? o.label ?? '').trim().slice(0, 6)
  if (!id || !tag) return null
  const tone = String(o.tone ?? 'default').trim().slice(0, 16) || 'default'
  return { id, tag, tone }
}

function normalizeMatchItem(x: unknown): { id: string; score: number; tag: string; tone: string } | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const id = String(o.id ?? '').trim()
  if (!id) return null
  let score = Number(o.score ?? o.matchScore ?? o.match ?? 0)
  if (!Number.isFinite(score)) score = 0
  score = Math.max(0, Math.min(100, Math.round(score)))
  const tag = String(o.tag ?? o.label ?? '').trim().slice(0, 6)
  const tone = String(o.tone ?? (score >= 75 ? 'match' : 'default')).trim().slice(0, 16) || 'default'
  return { id, score, tag: tag || (score >= 75 ? '高匹配' : ''), tone }
}

async function callLlm(
  env: Record<string, string>,
  provider: AIProvider,
  system: string,
  user: string,
  temperature = 0.2,
): Promise<string> {
  const res = await routeAiChat(
    {
      provider,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature,
      stream: false,
    },
    env,
  )
  return String(res.content || '').trim()
}

async function callLlmWithFallback(
  env: Record<string, string>,
  preferred: string | undefined,
  system: string,
  user: string,
  temperature = 0.2,
): Promise<{ text: string; provider: AIProvider }> {
  const chain = providerChain(env, preferred)
  if (!chain.length) throw new Error('ai_not_configured')
  let lastErr = ''
  for (const provider of chain) {
    try {
      const text = await callLlm(env, provider, system, user, temperature)
      if (text) return { text, provider }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (!isRetryableAiError(e)) throw e
    }
  }
  throw new Error(lastErr || 'all_providers_quota_exhausted')
}

function clampMatchItemsForTalent(
  items: Array<{ id: string; score: number; tag: string; tone: string }>,
  orders: MpRecruitmentAiOrderInput[],
  talent: TalentMatchProfile,
) {
  const orderMap = new Map(orders.map((o) => [o.id, o as OrderMatchPayload]))
  return items.map((item) => {
    const order = orderMap.get(item.id)
    if (!order) return item
    return { ...item, score: clampMatchScoreByFacts(item.score, order, talent) }
  })
}

function clampMatchItemsForOrders(
  items: Array<{ id: string; score: number; tag: string; tone: string }>,
  orders: MpRecruitmentAiOrderInput[],
  talents: MpRecruitmentAiTalentInput[],
) {
  const talentMap = new Map(talents.map((t) => [String(t.id || ''), t as TalentMatchProfile]))
  const orderPayloads = orders.map((o) => o as OrderMatchPayload)
  return items.map((item) => {
    const talent = talentMap.get(item.id)
    if (!talent) return item
    return { ...item, score: clampTalentScoreForOrders(item.score, orderPayloads, talent) }
  })
}

export async function runMpRecruitmentAiCore(
  bodyRaw: string,
  env: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  let body: {
    mode?: string
    provider?: string
    orders?: MpRecruitmentAiOrderInput[]
    talent?: MpRecruitmentAiTalentInput
    talents?: MpRecruitmentAiTalentInput[]
  }
  try {
    body = JSON.parse(bodyRaw || '{}') as typeof body
  } catch {
    return { status: 400, body: { ok: false, error: 'invalid_json' } }
  }

  const mode = String(body.mode || 'tag').trim()
  const orders = Array.isArray(body.orders) ? body.orders.filter((o) => o && o.id).slice(0, 8) : []
  const talents = Array.isArray(body.talents)
    ? body.talents.filter((t) => t && t.id).slice(0, 20)
    : []

  if (mode === 'match_talent') {
    if (!orders.length || !talents.length) {
      return { status: 400, body: { ok: false, error: 'orders_and_talents_required' } }
    }
  } else if (!orders.length) {
    return { status: 400, body: { ok: false, error: 'orders_required' } }
  }

  if (!providerChain(env, body.provider).length) {
    return {
      status: 503,
      body: {
        ok: false,
        error: 'ai_not_configured',
        hint: '请在服务端配置 MERCHANT_AI_DOUBAO_KEY、MERCHANT_AI_QWEN_KEY 或 MERCHANT_AI_MINIMAX_KEY',
      },
    }
  }

  const orderJson = JSON.stringify(
    mode === 'match_talent' ? orders.map(compactPrOrder) : orders.map(compactOrder),
  )
  const talentJson = JSON.stringify(talents.map(compactTalent))

  try {
    if (mode === 'match_talent') {
      const system = `你是 PR 招募智能匹配助手。根据 PR 近期发布的招募单（含标签、预算、粉丝/等级要求、描述），为每位达人/拍摄/剪辑候选评估契合度。
${MATCH_SCORE_GUIDE}
只输出 JSON 数组。每项：id（候选 id）、score（0-100 整数）、tag（2-4 字，如高度契合/平台匹配/粉丝达标/同城达人/拍剪匹配）、tone（match|hot|niche|default）。`
      const user = `PR 近期招募单（合并评估，注意 recruitTarget 区分达人/拍摄/剪辑）：${orderJson}

候选列表（含 workIdentity、标签、报价、等级、技能）：${talentJson}

请为每位候选打分，按与发单需求的最佳匹配度排序思路给出 score。跨城、平台不符须低分。`
      const { text, provider } = await callLlmWithFallback(env, body.provider, system, user, 0)
      const rawItems = extractJsonArray(text)
        .map(normalizeMatchItem)
        .filter((x): x is NonNullable<typeof x> => !!x)
      const items = clampMatchItemsForOrders(rawItems, orders, talents)
      return { status: 200, body: { ok: true, provider, mode: 'match_talent', items } }
    }

    if (mode === 'match') {
      const talent = compactTalent(body.talent || {})
      const system = `你是本地生活招募智能匹配助手。根据达人/拍摄/剪辑团队资料，为每条商单评估匹配度。
${MATCH_SCORE_GUIDE}
只输出 JSON 数组，无其它文字。每项：id（商单 id）、score（0-100 整数）、tag（2-4 字中文亮点）、tone（match|hot|urgent|ice|budget|niche|default）。`
      const user = `候选资料（含身份 workIdentity、标签 accountTags、报价 quotePrice、等级 douyinSalesLevel、报名习惯 applicationHabits）：${JSON.stringify(talent)}

商单列表（含平台、城市、类目、预算、粉丝要求、招募对象 recruitTarget、描述 summary）：${orderJson}

请为每条商单打分。若候选与商单同城、同平台、粉丝/等级达标且标签或类目契合，请给 85 分以上。`
      const { text, provider } = await callLlmWithFallback(env, body.provider, system, user, 0)
      const rawItems = extractJsonArray(text)
        .map(normalizeMatchItem)
        .filter((x): x is NonNullable<typeof x> => !!x)
      const items = clampMatchItemsForTalent(rawItems, orders, body.talent || {})
      return { status: 200, body: { ok: true, provider, mode: 'match', items } }
    }

    const system = `你是本地生活招募商单解读助手。逐条阅读商单的平台、城市/区域、品类标签 categoryTagsText、预算与报价模式 feeMode、CPS 比例 cpsPercent（hasCommission 为 true 才有佣金）、粉丝与带货等级要求、招募对象（达人/拍摄/剪辑）及描述摘要，提炼最能吸引对应供给方的一个短标签（2-4 个汉字，勿与「收集中/急单/演示」等状态重复）。
规则：CPS 为 0 或 hasCommission 为 false 时，禁止使用「佣金友好」「高佣优选」「高佣」等佣金类标签；应优先用自报价、一口价、置换友好、阶梯报价、品类标签（如生活记录、美食探店）等。
只输出 JSON 数组。每项：id、tag（2-4字）、tone（hot|match|urgent|ice|budget|niche|default）。
示例：自报价、一口价、同城急单、云剪直派、粉丝友好、美食探店、置换友好、生活记录、佣金友好（仅 hasCommission 为 true 时）。`
    const user = `商单列表（含 platform/region/categoryTagsText/feeMode/cpsPercent/hasCommission/budget/priceAmount/fans/recruitTarget/summary）：${orderJson}

请为每条商单生成一个最贴切、可点击的展示标签。`
    const { text, provider } = await callLlmWithFallback(env, body.provider, system, user)
    const orderById = new Map(orders.map((o) => [String(o.id), o as OrderMatchPayload]))
    const items = extractJsonArray(text)
      .map(normalizeTagItem)
      .filter((x): x is NonNullable<typeof x> => !!x)
      .map((item) => {
        const order = orderById.get(item.id)
        if (!order) return item
        const sanitized = sanitizeAiOrderTag(item.tag, item.tone, order)
        if (sanitized) return { ...item, tag: sanitized.tag, tone: sanitized.tone }
        const fb = fallbackOrderHighlightTag(order)
        return { ...item, tag: fb.aiTag, tone: fb.aiTagTone }
      })
    return { status: 200, body: { ok: true, provider, mode: 'tag', items } }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { status: 500, body: { ok: false, error: 'mp_recruitment_ai_failed', detail: msg.slice(0, 600) } }
  }
}
