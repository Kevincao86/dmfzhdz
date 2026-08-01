/**
 * 店铺分析：评价摘要 + GPT（优先）完整经营报告
 */
import { fetchDouyinAkteReviews, type MerchantReviewRowDouyin } from './douyinMerchantGateway.js'
import {
  buildShopAdviceFacts,
  type ShopAnalysisSummary,
} from './merchantPlatformOrdersCore.js'
import {
  merchantChatTextWithVendorFailover,
  type MerchantAiEnv,
} from './merchantAiUpstream.js'

/** GPT 优先，国内文案模型兜底 */
export const SHOP_ANALYSIS_AI_VENDOR_ORDER = ['openai', 'qwen', 'doubao'] as const

export type ShopReviewDigest = {
  ok: boolean
  message?: string
  warning?: string
  total: number
  avgStars: number
  goodCount: number
  neutralCount: number
  badCount: number
  unrepliedCount: number
  goodShare: number
  badShare: number
  badSamples: { stars: number; text: string; poiName?: string }[]
}

export type ShopAiReportSection = { title: string; body: string; bullets: string[] }

function ymdToMsStart(ymd: string): number {
  return new Date(`${ymd}T00:00:00+08:00`).getTime()
}

function ymdToMsEnd(ymd: string): number {
  return new Date(`${ymd}T23:59:59.999+08:00`).getTime()
}

function inRange(iso: string, startYmd: string, endYmd: string): boolean {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return true
  return t >= ymdToMsStart(startYmd) && t <= ymdToMsEnd(endYmd)
}

export function aggregateReviewDigest(
  items: MerchantReviewRowDouyin[],
  startYmd: string,
  endYmd: string,
): ShopReviewDigest {
  const filtered = items.filter((x) => inRange(x.createdAt, startYmd, endYmd))
  const total = filtered.length
  if (!total) {
    return {
      ok: true,
      total: 0,
      avgStars: 0,
      goodCount: 0,
      neutralCount: 0,
      badCount: 0,
      unrepliedCount: 0,
      goodShare: 0,
      badShare: 0,
      badSamples: [],
      message: '区间内暂无评价',
    }
  }
  let starSum = 0
  let goodCount = 0
  let neutralCount = 0
  let badCount = 0
  let unrepliedCount = 0
  const badSamples: ShopReviewDigest['badSamples'] = []
  for (const r of filtered) {
    starSum += Number(r.ratingStars) || 0
    if (r.sentiment === 'good') goodCount += 1
    else if (r.sentiment === 'bad') badCount += 1
    else neutralCount += 1
    if (!r.replied) unrepliedCount += 1
    if (r.sentiment === 'bad' && badSamples.length < 6) {
      const text = (r.content || '').trim().slice(0, 120)
      if (text) badSamples.push({ stars: r.ratingStars, text, poiName: r.poiName })
    }
  }
  return {
    ok: true,
    total,
    avgStars: Math.round((starSum / total) * 100) / 100,
    goodCount,
    neutralCount,
    badCount,
    unrepliedCount,
    goodShare: Math.round((goodCount / total) * 10000) / 100,
    badShare: Math.round((badCount / total) * 10000) / 100,
    badSamples,
  }
}

export async function buildShopReviewDigest(params: {
  douyinToken: string
  startYmd: string
  endYmd: string
  poiId?: string
  poiIdsHint?: string[]
}): Promise<ShopReviewDigest> {
  const token = params.douyinToken.trim()
  if (!token) {
    return {
      ok: false,
      message: '未绑定抖音来客，无法拉取评价',
      total: 0,
      avgStars: 0,
      goodCount: 0,
      neutralCount: 0,
      badCount: 0,
      unrepliedCount: 0,
      goodShare: 0,
      badShare: 0,
      badSamples: [],
    }
  }
  const poiId = params.poiId?.trim()
  const hint = (params.poiIdsHint || []).map((x) => x.trim()).filter((x) => x && x !== '_unknown')
  try {
    const r = await fetchDouyinAkteReviews(token, {
      kind: 'store',
      ...(poiId && poiId !== '_unknown'
        ? { poiId }
        : hint.length
          ? { poiIds: hint.slice(0, 12) }
          : {}),
    })
    if (!r.ok) {
      return {
        ok: false,
        message: r.message || '评价拉取失败',
        total: 0,
        avgStars: 0,
        goodCount: 0,
        neutralCount: 0,
        badCount: 0,
        unrepliedCount: 0,
        goodShare: 0,
        badShare: 0,
        badSamples: [],
      }
    }
    const digest = aggregateReviewDigest(r.items, params.startYmd, params.endYmd)
    if (r.warning) digest.warning = r.warning
    return digest
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
      total: 0,
      avgStars: 0,
      goodCount: 0,
      neutralCount: 0,
      badCount: 0,
      unrepliedCount: 0,
      goodShare: 0,
      badShare: 0,
      badSamples: [],
    }
  }
}

export function formatReviewDigestForPrompt(d: ShopReviewDigest): string {
  if (!d.ok) {
    return `【评价口碑】拉取失败或不具备权限：${d.message || '未知错误'}（请继续基于订单数据给出建议，勿编造评分）。`
  }
  if (d.total <= 0) {
    return `【评价口碑】区间内暂无评价数据${d.warning ? `；${d.warning}` : ''}。`
  }
  const samples = d.badSamples.length
    ? d.badSamples.map((s, i) => `${i + 1}. ${s.stars}星「${s.text}」${s.poiName ? `@${s.poiName}` : ''}`).join('\n')
    : '（无差评摘录）'
  return [
    `【评价口碑】共 ${d.total} 条，均分 ${d.avgStars} 星；好评 ${d.goodCount}（${d.goodShare}%）、中评 ${d.neutralCount}、差评 ${d.badCount}（${d.badShare}%）；未回复 ${d.unrepliedCount}。`,
    d.warning ? `备注：${d.warning}` : '',
    `差评摘录：\n${samples}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export function parseShopAiReportSections(text: string): ShopAiReportSection[] {
  const raw = (text || '').trim()
  if (!raw) return []
  const parts = raw.split(/\n(?=(?:#{1,3}\s+|[一二三四五六七八]、|[1-5]\.\s))/)
  const sections = parts
    .map((block) => {
      const lines = block.trim().split('\n')
      let title = (lines[0] || '').replace(/^#{1,3}\s+/, '').replace(/^\d+\.\s+/, '').trim()
      const bodyLines = lines
        .slice(1)
        .map((l) => l.replace(/^[-*·•]\s*/, '').replace(/^\d+[\.、]\s*/, '').trim())
        .filter(Boolean)
      return { title, body: bodyLines.join('\n'), bullets: bodyLines }
    })
    .filter((x) => x.title)
  if (sections.length) return sections
  return [{ title: '经营分析报告', body: raw, bullets: raw.split('\n').map((l) => l.trim()).filter(Boolean) }]
}

function buildSystemPrompt(): string {
  return [
    '你是资深本地生活（抖音来客）店铺经营顾问，擅长团购成交、退款履约、客群运营与评价口碑诊断。',
    '请基于用户提供的【数据事实】撰写完整中文经营分析报告，要求专业、具体、可执行，禁止编造未给出的数字。',
    '客群新老客为灵祺根据订单 open_id 推算，并非抖音官方用户标签；文中须点明这一点。',
    '输出必须使用以下五个一级标题（可带序号），每节 3～6 条要点，用「· 」开头：',
    '一、经营总览',
    '二、客群洞察',
    '三、商品与退款',
    '四、评价口碑',
    '五、行动建议',
    '第五节须给出未来 7～14 天可落地的优先动作（含负责人视角：运营/门店/客服）。',
  ].join('\n')
}

function buildUserPrompt(params: {
  rangeLabel: string
  platform: string
  poiLabel: string
  facts: string
  reviewBlock: string
  guestBasis: string
}): string {
  return [
    `统计区间：${params.rangeLabel}`,
    `平台：${params.platform}`,
    `门店范围：${params.poiLabel}`,
    `客群口径：${params.guestBasis}`,
    '',
    params.facts,
    '',
    params.reviewBlock,
    '',
    '请输出完整五节分析报告。',
  ].join('\n')
}

export async function generateShopAnalysisAiReport(params: {
  env: MerchantAiEnv
  summary: ShopAnalysisSummary
  adviceFacts: string
  reviewDigest: ShopReviewDigest
  startYmd: string
  endYmd: string
  platform: string
  poiLabel: string
}): Promise<{ ok: true; text: string; modelUsed: string } | { ok: false; message: string }> {
  const guestBasis =
    params.summary.guestBasis === 'history'
      ? '按区间开始前是否有成交判定新老客'
      : '库内无更早订单，按区间内是否复购判定新老客（非抖音官方标签）'
  const system = buildSystemPrompt()
  const user = buildUserPrompt({
    rangeLabel: `${params.startYmd} ~ ${params.endYmd}`,
    platform: params.platform === 'douyin' ? '抖音来客' : params.platform,
    poiLabel: params.poiLabel,
    facts: params.adviceFacts || buildShopAdviceFacts(params.summary, `${params.startYmd} ~ ${params.endYmd}`),
    reviewBlock: formatReviewDigestForPrompt(params.reviewDigest),
    guestBasis,
  })
  const r = await merchantChatTextWithVendorFailover(
    params.env,
    system,
    user,
    SHOP_ANALYSIS_AI_VENDOR_ORDER,
  )
  if (!r.ok) return { ok: false, message: r.message || 'AI 分析失败' }
  return { ok: true, text: r.text, modelUsed: r.modelUsed }
}
