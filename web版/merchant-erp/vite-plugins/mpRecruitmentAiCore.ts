import type { AIProvider } from '../src/services/ai/types.js'
import { routeAiChat } from './aiGateway/chatRouter.js'
import {
  clampMatchScoreByFacts,
  clampTalentScoreForOrders,
  fallbackOrderHighlightTag,
  sanitizeAiOrderTag,
  withHallAiTagColors,
  type OrderMatchPayload,
  type TalentMatchProfile,
} from '../src/lib/mpRecruitmentMatchShared.js'

export type MpRecruitmentAiOrderInput = {
  id: string
  title?: string
  platform?: string
  region?: string
  category?: string
  categoryTagsText?: string
  budgetText?: string
  fansRequirement?: string
  hall?: string
  urgent?: boolean
  isIce?: boolean
  summary?: string
  recruitTarget?: string
  priceAmount?: number
  feeMode?: string
  cpsPercent?: number | null
  hasCommission?: boolean
  talentTags?: string[]
  recruitmentInfo?: string
  merchantRequirements?: string
  taskDetail?: string
  recruitContent?: string
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
  if (provider === 'deepseek') {
    return Boolean((env.DEEPSEEK_API_KEY ?? env.MERCHANT_AI_DEEPSEEK_KEY ?? '').trim())
  }
  if (provider === 'kimi') {
    return Boolean((env.MOONSHOT_API_KEY ?? env.MERCHANT_AI_KIMI_KEY ?? env.KIMI_API_KEY ?? '').trim())
  }
  return false
}

/** 招募打标：额度不足时按顺序自动切换（与运营台 AI 模型页厂商一致） */
function providerChain(env: Record<string, string>, preferred?: string): AIProvider[] {
  const chain: AIProvider[] = []
  const add = (p: AIProvider) => {
    if (hasKey(env, p) && !chain.includes(p)) chain.push(p)
  }
  const want = String(preferred || env.MERCHANT_MP_AI_PROVIDER || 'doubao').trim() as AIProvider
  add(want)
  for (const p of ['doubao', 'qwen', 'minimax', 'kimi', 'deepseek'] as AIProvider[]) add(p)
  return chain
}

function isRetryableAiError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
  return /429|quota|rate.?limit|余额|不足|insufficient|exhausted|limit exceeded|too many|resource|额度|欠费|over.?limit|capacity|does not exist|not have access|model.*not.*found|invalid.*model|endpoint.*not|unknown model|model.*unavailable|access.*denied/.test(
    msg,
  )
}

function compactOrder(o: MpRecruitmentAiOrderInput): Record<string, unknown> {
  const recruitContent = String(
    o.recruitContent ||
      [o.recruitmentInfo, o.merchantRequirements, o.taskDetail, o.summary].filter(Boolean).join('\n'),
  ).slice(0, 2400)
  return {
    id: o.id,
    title: (o.title || '').slice(0, 120),
    platform: o.platform || '',
    region: o.region || '',
    category: o.category || '',
    categoryTagsText: String(o.categoryTagsText || '').slice(0, 80),
    talentTags: Array.isArray(o.talentTags) ? o.talentTags.slice(0, 8) : [],
    budget: o.budgetText || '',
    feeMode: o.feeMode || '',
    cpsPercent: o.cpsPercent ?? null,
    hasCommission: o.hasCommission === true,
    priceAmount: o.priceAmount ?? 0,
    fans: o.fansRequirement || '',
    recruitTarget: o.recruitTarget || 'talent',
    hall: o.hall || (o.isIce ? 'ice' : o.urgent ? 'urgent' : 'normal'),
    summary: String(o.summary || '').slice(0, 400),
    recruitContent,
    recruitmentInfo: String(o.recruitmentInfo || '').slice(0, 1000),
    merchantRequirements: String(o.merchantRequirements || '').slice(0, 1000),
    taskDetail: String(o.taskDetail || '').slice(0, 800),
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

function normalizeTagItem(x: unknown): { id: string; tag: string; tone: string; bg: string; fg: string } | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const id = String(o.id ?? '').trim()
  const tag = String(o.tag ?? o.label ?? '').trim().slice(0, 6)
  if (!id || !tag) return null
  const tone = String(o.tone ?? 'default').trim().slice(0, 16) || 'default'
  const styled = withHallAiTagColors(tag, tone)
  return { id, tag: styled.aiTag, tone: styled.aiTagTone, bg: styled.aiTagBg, fg: styled.aiTagFg }
}

export type MpRecruitmentVisitScheduleTalentInput = {
  id: string
  nickname?: string
  followers?: number | string
  visitTimeSlot?: string
  scheduleConfirmedAt?: string
}

export type MpRecruitmentVisitScheduleContext = {
  title?: string
  storeName?: string
  category?: string
  visitSlots?: string[]
  shareTable?: boolean
  mealCount?: number
  tableSize?: number
  talents?: MpRecruitmentVisitScheduleTalentInput[]
}

export type MpRecruitmentVisitScheduleRow = {
  time: string
  talentName: string
  talentId?: string
  storeName?: string
  tableNote?: string
}

function normalizeVisitScheduleRow(x: unknown): MpRecruitmentVisitScheduleRow | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const time = String(o.time ?? o.slot ?? '').trim()
  const talentName = String(o.talentName ?? o.name ?? o.nickname ?? '').trim()
  const talentId = String(o.talentId ?? o.id ?? '').trim()
  if (!time || (!talentName && !talentId)) return null
  return {
    time,
    talentName: talentName || talentId,
    storeName: String(o.storeName ?? o.store ?? '').trim() || undefined,
    tableNote: String(o.tableNote ?? o.note ?? '').trim() || undefined,
    talentId: talentId || undefined,
  }
}

function normalizeMatchItem(x: unknown): { id: string; score: number; tag: string; tone: string; advantage: string } | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const id = String(o.id ?? '').trim()
  if (!id) return null
  let score = Number(o.score ?? o.matchScore ?? o.match ?? 0)
  if (!Number.isFinite(score)) score = 0
  score = Math.max(0, Math.min(100, Math.round(score)))
  const tag = String(o.tag ?? o.label ?? '').trim().slice(0, 6)
  const tone = String(o.tone ?? (score >= 75 ? 'match' : 'default')).trim().slice(0, 16) || 'default'
  const advantage = String(o.advantage ?? o.reason ?? o.summary ?? '').trim().slice(0, 80)
  return { id, score, tag: tag || (score >= 75 ? '高匹配' : ''), tone, advantage }
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

function buildFallbackTagItems(orders: MpRecruitmentAiOrderInput[]) {
  return orders
    .map((o) => {
      const fb = fallbackOrderHighlightTag(o as OrderMatchPayload)
      const styled = withHallAiTagColors(fb.aiTag, fb.aiTagTone)
      return {
        id: String(o.id),
        tag: styled.aiTag,
        tone: styled.aiTagTone,
        bg: styled.aiTagBg,
        fg: styled.aiTagFg,
      }
    })
    .filter((x) => x.id && x.tag)
}

function buildFallbackMatchItems(
  orders: MpRecruitmentAiOrderInput[],
  talent?: MpRecruitmentAiTalentInput,
  talents?: MpRecruitmentAiTalentInput[],
) {
  if (talent && orders.length) {
    return orders.map((o) => ({
      id: String(o.id),
      score: 50,
      tag: '',
      tone: 'default',
    }))
  }
  if (talents?.length) {
    return talents.map((t) => ({
      id: String(t.id || ''),
      score: 50,
      tag: '',
      tone: 'default',
    })).filter((x) => x.id)
  }
  return []
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
  items: Array<{ id: string; score: number; tag: string; tone: string; advantage?: string }>,
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
    context?: MpRecruitmentVisitScheduleContext
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

  if (mode === 'visit_schedule') {
    const ctx = body.context || {}
    const scheduleTalents = Array.isArray(ctx.talents)
      ? ctx.talents.filter((t) => t && t.id).slice(0, 30)
      : []
    if (!scheduleTalents.length) {
      return { status: 400, body: { ok: false, error: 'talents_required' } }
    }
  } else if (mode === 'match_talent') {
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
        hint: '请在运营台「AI 模型」或 ~/stack/auth-api.env 配置至少一个厂商 Key：doubao / qwen / minimax / kimi / deepseek',
      },
    }
  }

  const orderJson = JSON.stringify(
    mode === 'match_talent' ? orders.map(compactPrOrder) : orders.map(compactOrder),
  )
  const talentJson = JSON.stringify(talents.map(compactTalent))

  try {
    if (mode === 'visit_schedule') {
      const ctx = body.context || {}
      const scheduleTalents = (ctx.talents || []).filter((t) => t && t.id).slice(0, 30)
      const visitSlots = (ctx.visitSlots || []).map((s) => String(s || '').trim()).filter(Boolean)
      const storeName = String(ctx.storeName || '门店').trim() || '门店'
      const shareTable = ctx.shareTable !== false
      const mealCount = Math.max(1, Number(ctx.mealCount) || 1)
      const tableSize = Math.max(2, Number(ctx.tableSize) || 4)
      const system = `你是本地生活达人探店排期助手。根据招募单信息、可探店时段、拼桌设置与已选达人名单，生成合理探店排期。
只输出 JSON 数组，不要 Markdown、不要解释。每个元素字段：
- talentId：达人 id（必须与输入名单 id 一致）
- time：如 "2026/6/15 17:00-20:00"（须含日期与时段）
- talentName：达人昵称（必须与输入名单一致）
- storeName：门店名
- tableNote：拼桌/餐食备注（如 "拼桌 4 人/桌 · 餐食 1 份"）
规则：优先尊重达人 visitTimeSlot；高粉丝量可适当靠前；${shareTable ? `餐饮拼桌每桌约 ${tableSize} 人` : '不拼桌单独探店'}；餐食 ${mealCount} 份；时段从给定 visitSlots 选取并错开日期。`
      const user = `招募：${String(ctx.title || '').slice(0, 80)} · 类目 ${String(ctx.category || '').slice(0, 40)} · 门店 ${storeName}
可探店时段：${(visitSlots.length ? visitSlots : ['09:00-12:00', '14:00-17:00', '17:00-20:00']).join('、')}
拼桌：${shareTable ? '是' : '否'} · 每桌 ${tableSize} 人 · 餐食 ${mealCount} 份

已选达人（须每人一条排期）：${JSON.stringify(
        scheduleTalents.map((t) => ({
          id: t.id,
          nickname: String(t.nickname || '').slice(0, 32),
          followers: t.followers ?? '',
          visitTimeSlot: String(t.visitTimeSlot || '').slice(0, 40),
          scheduleConfirmedAt: String(t.scheduleConfirmedAt || '').slice(0, 32),
        })),
      )}`
      const { text, provider } = await callLlmWithFallback(env, body.provider, system, user, 0.15)
      const rows = extractJsonArray(text)
        .map(normalizeVisitScheduleRow)
        .filter((x): x is MpRecruitmentVisitScheduleRow => !!x)
        .slice(0, 50)
      if (!rows.length) {
        return { status: 502, body: { ok: false, error: 'visit_schedule_parse_failed' } }
      }
      return { status: 200, body: { ok: true, provider, mode: 'visit_schedule', rows } }
    }

    if (mode === 'match_talent') {
      const system = `你是 PR 招募智能匹配助手。根据 PR 近期发布的招募单（含标签、预算、粉丝/等级要求、描述），为每位达人/拍摄/剪辑候选评估契合度。
${MATCH_SCORE_GUIDE}
只输出 JSON 数组。每项：id（候选 id）、score（0-100 整数）、tag（2-4 字，如高度契合/平台匹配/粉丝达标/同城达人/拍剪匹配）、tone（match|hot|niche|default）、advantage（15-40 字中文，解读该达人相对发单需求的核心优势，勿重复 tag）。`
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
只输出 JSON 数组，无其它文字。每项：id（商单 id）、score（0-100 整数）、tag（2-4 字中文亮点）、tone（match|hot|urgent|ice|budget|niche|default）、advantage（15-40 字中文，解读该商单对当前候选的核心优势，勿重复 tag）。`
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

    const system = `你是本地生活招募商单解读助手。必须通读每条商单的 recruitContent（招募全文，含标题/要求/说明/任务详情）、categoryTagsText、talentTags、平台、城市、预算 feeMode/cpsPercent/hasCommission、粉丝要求与招募对象，综合理解业务场景与供给方价值后，提炼一个最能概括「这条单特点」的短标签（2-4 个汉字）。
要求：
- 标签应体现内容形态、品类、难度、场景或收益特点（如：剪辑单、探店向、母婴向、稳定需求、短视频），不要只复述报价方式（禁止仅用「自报价」「一口价」作为标签，除非全文无其它亮点）。
- 勿与订单状态重复（收集中、急单、演示等）。
- CPS 为 0 或 hasCommission 为 false 时，禁止「佣金友好」「高佣优选」「高佣」。
只输出 JSON 数组。每项：id、tag（2-4字）、tone（hot|match|urgent|ice|budget|niche|default）。
示例：剪辑向、美食探店、稳定需求、云剪直派、生活记录、粉丝友好、佣金友好（仅 hasCommission 为 true）。`
    const user = `商单列表（JSON，含 recruitContent 全文）：${orderJson}

请为每条商单生成一个基于全文分析的最贴切展示标签。`
    const { text, provider } = await callLlmWithFallback(env, body.provider, system, user)
    const orderById = new Map(orders.map((o) => [String(o.id), o as OrderMatchPayload]))
    const items = extractJsonArray(text)
      .map(normalizeTagItem)
      .filter((x): x is NonNullable<typeof x> => !!x)
      .map((item) => {
        const order = orderById.get(item.id)
        if (!order) return item
        const sanitized = sanitizeAiOrderTag(item.tag, item.tone, order)
        if (sanitized) {
          const styled = withHallAiTagColors(sanitized.tag, sanitized.tone)
          return { ...item, tag: styled.aiTag, tone: styled.aiTagTone, bg: styled.aiTagBg, fg: styled.aiTagFg }
        }
        const fb = fallbackOrderHighlightTag(order)
        const styled = withHallAiTagColors(fb.aiTag, fb.aiTagTone)
        return { ...item, tag: styled.aiTag, tone: styled.aiTagTone, bg: styled.aiTagBg, fg: styled.aiTagFg }
      })
    return { status: 200, body: { ok: true, provider, mode: 'tag', items } }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (mode === 'tag' && orders.length) {
      return {
        status: 200,
        body: {
          ok: true,
          mode: 'tag',
          provider: 'fallback',
          fallback: true,
          detail: msg.slice(0, 240),
          items: buildFallbackTagItems(orders),
        },
      }
    }
    if ((mode === 'match' || mode === 'match_talent') && orders.length) {
      const items =
        mode === 'match_talent'
          ? buildFallbackMatchItems(orders, undefined, talents)
          : buildFallbackMatchItems(orders, body.talent, undefined)
      return {
        status: 200,
        body: {
          ok: true,
          mode,
          provider: 'fallback',
          fallback: true,
          detail: msg.slice(0, 240),
          items,
        },
      }
    }
    return { status: 500, body: { ok: false, error: 'mp_recruitment_ai_failed', detail: msg.slice(0, 600) } }
  }
}
