import type { AIProvider } from '../src/services/ai/types.js'
import { routeAiChat } from './aiGateway/chatRouter.js'

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
}

export type MpRecruitmentAiTalentInput = {
  id?: string
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
}

function compactTalent(t: MpRecruitmentAiTalentInput): Record<string, unknown> {
  return {
    id: String(t.id ?? '').trim(),
    platform: t.platform || '',
    nickname: (t.nickname || '').slice(0, 32),
    followers: t.followers ?? '',
    region: t.region || [t.province, t.city].filter(Boolean).join(' '),
    accountTags: Array.isArray(t.accountTags) ? t.accountTags.slice(0, 4) : [],
    douyinSalesLevel: t.douyinSalesLevel || '',
    gender: t.gender || '',
    quality: t.quality || '',
    tags: Array.isArray(t.tags) ? t.tags.slice(0, 4) : [],
  }
}

function compactPrOrder(o: MpRecruitmentAiOrderInput & { talentTags?: string[]; infoSummary?: string }) {
  return {
    ...compactOrder(o),
    talentTags: Array.isArray(o.talentTags) ? o.talentTags : [],
    info: String(o.infoSummary || o.summary || '').slice(0, 400),
  }
}

function hasKey(env: Record<string, string>, provider: AIProvider): boolean {
  if (provider === 'doubao') {
    return Boolean((env.MERCHANT_AI_DOUBAO_KEY ?? env.ARK_API_KEY ?? '').trim())
  }
  if (provider === 'qwen') {
    return Boolean((env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim())
  }
  return false
}

function pickProvider(env: Record<string, string>, preferred?: string): AIProvider | null {
  const want = String(preferred || env.MERCHANT_MP_AI_PROVIDER || 'doubao').trim() as AIProvider
  if (want === 'doubao' || want === 'qwen') {
    if (hasKey(env, want)) return want
    const alt = want === 'doubao' ? 'qwen' : 'doubao'
    if (hasKey(env, alt)) return alt
  }
  if (hasKey(env, 'doubao')) return 'doubao'
  if (hasKey(env, 'qwen')) return 'qwen'
  return null
}

function compactOrder(o: MpRecruitmentAiOrderInput): Record<string, unknown> {
  return {
    id: o.id,
    title: (o.title || '').slice(0, 80),
    platform: o.platform || '',
    region: o.region || '',
    category: o.category || '',
    budget: o.budgetText || '',
    fans: o.fansRequirement || '',
    hall: o.hall || (o.isIce ? 'ice' : o.urgent ? 'urgent' : 'normal'),
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
    if (j && typeof j === 'object') {
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
): Promise<string> {
  const res = await routeAiChat(
    {
      provider,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.25,
      stream: false,
    },
    env,
  )
  return String(res.content || '').trim()
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

  const provider = pickProvider(env, body.provider)
  if (!provider) {
    return {
      status: 503,
      body: {
        ok: false,
        error: 'ai_not_configured',
        hint: '请在服务端配置 MERCHANT_AI_DOUBAO_KEY 或 MERCHANT_AI_QWEN_KEY',
      },
    }
  }

  const orderJson = JSON.stringify(
    mode === 'match_talent' ? orders.map((o) => compactPrOrder(o as MpRecruitmentAiOrderInput & { talentTags?: string[]; infoSummary?: string })) : orders.map(compactOrder),
  )
  const talentJson = JSON.stringify(talents.map(compactTalent))

  try {
    if (mode === 'match_talent') {
      const system = `你是 PR 达人招募匹配助手。根据 PR 近期发布的招募单要求，为每位达人评估与发单需求的契合度。
只输出 JSON 数组。每项：id（达人id）、score（0-100）、tag（2-4字标签，如高度契合/平台匹配/粉丝达标/同城达人）、tone（match|hot|niche|default）。
score 综合平台、城市、粉丝、标签、带货等级与发单要求；无契合则 score 低于 40。`
      const user = `PR 近期招募单（合并评估）：${orderJson}

达人列表：${talentJson}

请为每位达人打分（相对该 PR 发单需求的最佳匹配度）。`
      const text = await callLlm(env, provider, system, user)
      const items = extractJsonArray(text)
        .map(normalizeMatchItem)
        .filter((x): x is NonNullable<typeof x> => !!x)
      return { status: 200, body: { ok: true, provider, mode: 'match_talent', items } }
    }

    if (mode === 'match') {
      const talent = body.talent || {}
      const system = `你是本地生活达人招募匹配助手。根据达人资料为每条商单评估匹配度。
只输出 JSON 数组，无其它文字。每项字段：id（商单id）、score（0-100整数）、tag（2-4字中文亮点标签，如高匹配/同城优选/粉丝友好）、tone（match|hot|urgent|ice|budget|niche|default）。`
      const user = `达人资料：${JSON.stringify(talent)}

商单列表：${orderJson}

请为每条商单打分并给标签，score 越高越适合该达人。`
      const text = await callLlm(env, provider, system, user)
      const items = extractJsonArray(text)
        .map(normalizeMatchItem)
        .filter((x): x is NonNullable<typeof x> => !!x)
      return { status: 200, body: { ok: true, provider, mode: 'match', items } }
    }

    const system = `你是本地生活招募商单标注助手。为每条商单生成一个醒目、简短的自定义标签（2-4个汉字，勿与状态重复）。
只输出 JSON 数组。每项：id、tag（2-4字）、tone（hot|match|urgent|ice|budget|niche|default）。
标签示例：高佣优选、同城急单、云剪直派、粉丝友好、美食探店、置换友好。`
    const user = `商单列表：${orderJson}

请为每条商单生成一个最合适的展示标签。`
    const text = await callLlm(env, provider, system, user)
    const items = extractJsonArray(text)
      .map(normalizeTagItem)
      .filter((x): x is NonNullable<typeof x> => !!x)
    return { status: 200, body: { ok: true, provider, mode: 'tag', items } }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { status: 500, body: { ok: false, error: 'mp_recruitment_ai_failed', detail: msg.slice(0, 600) } }
  }
}
