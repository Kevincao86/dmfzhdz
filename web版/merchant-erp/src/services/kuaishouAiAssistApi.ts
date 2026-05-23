/**
 * 快手团购商品创建 — AI 辅助（标题 / 说明 / 图片 / 豆包质检）。
 * 优先 `POST /api/meoo-kuaishou-goods-ai-assist`，回退 `POST /api/merchant/kuaishou/goods/ai/assist`。
 * 本地 dev：Vite 网关按 `model` 调用上游；密钥仅来自 Vercel / 服务端环境变量（MERCHANT_AI_*、手选 Gemini 时为 TOKENMIX_API_KEY），不再随请求附带浏览器 vendor_keys。
 * 文案：MiniMax、通义千问、豆包；手选 Gemini 走 TokenMix；生图：通义万相（wanx）、豆包（Seedream）、MiniMax（自动优先通义/豆包）；质检：仅豆包对话。
 */

import { isValidAiVendorSlug } from '../lib/aiVendorCatalogShared'
import { readMerchantSession } from '../lib/merchantSession'

export { listAiUiModelOptions } from './merchantAiVendorCatalogClient'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

function assistFetchUrlCandidates(path: string): string[] {
  const out: string[] = []
  const add = (u: string) => {
    const t = u.trim()
    if (!t || out.includes(t)) return
    out.push(t)
  }
  const p = path.startsWith('/') ? path : `/${path}`
  if (typeof window !== 'undefined' && window.location?.origin) {
    try {
      add(new URL(p, window.location.origin).href)
    } catch {
      /* ignore */
    }
  }
  const b = apiBase().replace(/\/$/, '')
  if (b) add(`${b}${p}`)
  if (out.length === 0) add(p)
  return out
}

function url(path: string) {
  const b = apiBase().replace(/\/$/, '')
  return `${b}${path}`
}

function authHeaders(): HeadersInit {
  const token = readMerchantSession('meoo_kuaishou_merchant_token')
  const h: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

export type AiModelId = string
export type ImageAiModelId = string

/** GEO 综合评分 / 咨询测试：仅走通义与豆包（MiniMax 不参与，避免额度与链路不一致） */
export type GeoTextAiModelId = 'qwen' | 'doubao'

export const GEO_TEXT_AI_MODEL_OPTIONS: { id: GeoTextAiModelId; label: string }[] = [
  { id: 'qwen', label: '通义千问' },
  { id: 'doubao', label: '豆包' },
]

export function coerceGeoTextAiModel(id: AiModelId): GeoTextAiModelId {
  return id === 'doubao' ? 'doubao' : 'qwen'
}

export type AiAssistAction =
  | 'optimize_title'
  | 'generate_desc'
  | 'image_generate'
  | 'image_enhance'
  | 'analyze_product_quality'
  /** 运营：图文稿件（与商品 AI 同源网关，需抖音 Bearer） */
  | 'operation_article'
  /** 运营：选题推荐 */
  | 'operation_topic'
  /** GEO：将门店知识包与用户咨询一并送入已绑定的文本模型（联调/实测） */
  | 'geo_ai_consult'
  /** GEO：根据知识包一键生成模拟用户咨询文案 */
  | 'geo_ai_consult_question'
  /** GEO：基于快手团购门店事实 JSON 输出三维度得分与待办（JSON） */
  | 'geo_ai_score'

export type QualityProductPayload = {
  id: string
  name: string
  price_yuan?: number
  title?: string
  main_image_url?: string
  detail_excerpt?: string
}

export type QualityDimensionScore = { score: number; comment: string }

export type ProductQualityItem = {
  productId: string
  productName: string
  overall: number
  titleHeat: QualityDimensionScore
  mainImage: QualityDimensionScore
  detailPage: QualityDimensionScore
  /** 标价合理性、与毛利/行业参考的匹配度及调价/套餐建议等 */
  priceAnalysis: QualityDimensionScore
  suggestions: string[]
}

/** 质检时传入的门店定价/毛利上下文（与网关约定字段） */
export type ProductQualityPricingContext = {
  industry_name: string
  industry_path?: string
  benchmark_note?: string
  /** 商家在 ERP 中配置的门店综合毛利率（%），按平台 */
  merchant_gross_margin_percent: { kuaishou: number; meituan: number; xhs: number }
  /** 行业建议参考毛利率（%），可选 */
  suggested_benchmark_percent?: { kuaishou: number; meituan: number; xhs: number }
}

export type AiAssistRequest = {
  model: AiModelId
  action: AiAssistAction
  /** 当前商品名称（用于上下文） */
  product_name: string
  /** 标题框内用户输入，用于「智能优化」改写 */
  title_draft?: string
  /** 生图专用：团购标题原文（与 product_name 一致时仍显式传入） */
  listing_title?: string
  /** 生图专用：前端规则解析的主推产品，供网关锁定语义 */
  main_product_heuristic?: string
  /** 生图专用：售价/划线价（元），代金券券面字样 */
  price_yuan?: string
  origin_yuan?: string
  /** 生图用户句，如「帮我生成一张80代100代金券主图」 */
  image_user_line?: string
  /** 待美化图片 URL 列表（enhance）；单张或多张 */
  image_urls?: string[]
  image_role?: 'head' | 'aux' | 'env'
  /** 商品质量分析：与 action=analyze_product_quality 联用 */
  products?: QualityProductPayload[]
  /** 与 analyze_product_quality 联用：行业与毛利率，供模型评估售价合理性 */
  pricing_context?: ProductQualityPricingContext
  /** 与 geo_ai_consult 联用：本页维护的 GEO 结构化知识（事实、FAQ、问法等） */
  geo_knowledge_pack?: string
  /** 与 geo_ai_score 联用：抖音门店事实等 JSON 字符串 */
  geo_score_context?: string
  /** 商品创建向导：已选三级类目与商品类型，锁入文案/生图上下文 */
  goods_category_id?: string
  goods_product_type?: number
  goods_category_path_zh?: string
  goods_product_type_label?: string
}

export type AiAssistResult =
  | { ok: false; message: string; needVendorKey?: string }
  | {
      ok: true
      title?: string
      description?: string
      image_urls?: string[]
      /** 网关因上游失败自动改用的内置厂商 id（minimax / qwen / doubao） */
      ai_vendor_used?: string
      /** 生图调试：手选厂商 vs 实际像素引擎、是否代金券模式、主推锚点 */
      image_meta?: {
        requested_model: string
        resolved_model: string
        voucher_mode: boolean
        main_product_anchor: string
        image_user_line?: string
      }
    }

function parseNeedVendorKey(data: Record<string, unknown>): string | undefined {
  if (data.code !== 'NEED_VENDOR_KEY') return undefined
  const v = data.vendor
  if (typeof v !== 'string') return undefined
  const id = v.trim().toLowerCase()
  return isValidAiVendorSlug(id) ? id : undefined
}

function buildAssistPayload(body: AiAssistRequest): Record<string, unknown> {
  return { ...body }
}

function assistFetchTimeoutMs(action: AiAssistAction): number {
  if (action === 'image_generate' || action === 'image_enhance') return 170_000
  if (action === 'analyze_product_quality') return 120_000
  return 90_000
}

function abortSignalForAssist(action: AiAssistAction): AbortSignal | undefined {
  const ms = assistFetchTimeoutMs(action)
  const AS = AbortSignal as unknown as { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') {
    try {
      return AS.timeout(ms)
    } catch {
      return undefined
    }
  }
  return undefined
}

const AI_ASSIST_PATHS = ['/api/meoo-kuaishou-goods-ai-assist', '/api/merchant/kuaishou/goods/ai/assist'] as const

/** 与类目/线上搜品同源：优先顶层 meoo，避开生产环境深层 /api/merchant/* 404 */
async function postAiAssistFetch(
  bodyObj: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  const bodyStr = JSON.stringify(bodyObj)
  const headers = authHeaders()
  for (const p of AI_ASSIST_PATHS) {
    for (const target of assistFetchUrlCandidates(p)) {
      const res = await fetch(target, { method: 'POST', headers, body: bodyStr, signal })
      const text = await res.text()
      const trim = text.trimStart()
      const ct = res.headers.get('content-type') ?? ''
      if (res.status === 404) continue
      if (res.ok && (trim.startsWith('<') || /text\/html/i.test(ct))) continue
      return new Response(text, {
        status: res.status,
        statusText: res.statusText,
        headers: { 'Content-Type': ct || 'application/json; charset=utf-8' },
      })
    }
  }
  const fallback = assistFetchUrlCandidates(AI_ASSIST_PATHS[1])[0] ?? url(AI_ASSIST_PATHS[1])
  return fetch(fallback, { method: 'POST', headers, body: bodyStr, signal })
}

export async function postKuaishouGoodsAiAssist(body: AiAssistRequest): Promise<AiAssistResult> {
  const signal = abortSignalForAssist(body.action)
  let res: Response
  try {
    res = await postAiAssistFetch(buildAssistPayload(body), signal)
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    if (name === 'AbortError' || name === 'TimeoutError') {
      return { ok: false, message: '请求超时，生图仍在排队或上游较慢，请稍后重试或减少并发' }
    }
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
  const data = await parseJson(res)
  if (!res.ok) {
    return {
      ok: false,
      message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}`,
    }
  }
  if (data.ok === false) {
    const needVendorKey = parseNeedVendorKey(data)
    return {
      ok: false,
      message: typeof data.message === 'string' ? data.message : 'AI 请求失败',
      ...(needVendorKey ? { needVendorKey } : {}),
    }
  }
  const title = typeof data.title === 'string' ? data.title : undefined
  const description = typeof data.description === 'string' ? data.description : undefined
  const rawUrls = data.image_urls
  const image_urls = Array.isArray(rawUrls)
    ? rawUrls.map((x) => String(x)).filter((u) => u.length > 0)
    : undefined
  const ai_vendor_used_raw = data.ai_vendor_used
  const ai_vendor_used =
    typeof ai_vendor_used_raw === 'string' && ai_vendor_used_raw.trim()
      ? ai_vendor_used_raw.trim().toLowerCase()
      : undefined
  return {
    ok: true,
    title,
    description,
    image_urls,
    ...(ai_vendor_used ? { ai_vendor_used } : {}),
  }
}

/** GEO 页：用当前知识包 + 用户原问调用与商品 AI 同源网关（需抖音 Bearer + 已配置模型 Key） */
export async function postGeoAiConsult(body: {
  model: AiModelId
  /** 门店展示名，写入对话上下文标题 */
  store_display_name: string
  geo_knowledge_pack: string
  user_question: string
}): Promise<AiAssistResult> {
  return postKuaishouGoodsAiAssist({
    model: body.model,
    action: 'geo_ai_consult',
    product_name: body.store_display_name.trim() || '本店 GEO',
    title_draft: body.user_question.trim(),
    geo_knowledge_pack: body.geo_knowledge_pack.trim(),
  })
}

/** GEO 咨询测试：根据当前知识包生成一条模拟用户咨询（填入输入框后再「发送至 AI 模型」） */
export async function postGeoAiConsultQuestion(body: {
  model: AiModelId
  store_display_name: string
  geo_knowledge_pack: string
}): Promise<AiAssistResult> {
  return postKuaishouGoodsAiAssist({
    model: body.model,
    action: 'geo_ai_consult_question',
    product_name: body.store_display_name.trim() || '本店 GEO',
    title_draft: 'geo_consult_question',
    geo_knowledge_pack: body.geo_knowledge_pack.trim(),
  })
}

export type GeoAiScorePayload = {
  infoCompletenessPercent: number
  questionCoveragePercent: number
  contentFreshnessPercent: number
  rationale_zh: string
  todos: { title: string; type: string; priority: string }[]
  covered_queries?: { q: string; covered: boolean }[]
}

function clampInt(n: unknown, fallback: number): number {
  const x = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(x)) return fallback
  return Math.min(100, Math.max(0, Math.round(x)))
}

function normalizeGeoAiScorePayload(raw: Record<string, unknown>): GeoAiScorePayload | null {
  const infoCompletenessPercent = clampInt(raw.infoCompletenessPercent ?? raw.info_completeness_percent, 0)
  const questionCoveragePercent = clampInt(raw.questionCoveragePercent ?? raw.question_coverage_percent, 0)
  const contentFreshnessPercent = clampInt(raw.contentFreshnessPercent ?? raw.content_freshness_percent, 0)
  const rationale_zh =
    typeof raw.rationale_zh === 'string'
      ? raw.rationale_zh.trim()
      : typeof raw.rationale === 'string'
        ? raw.rationale.trim()
        : ''
  const todosIn = raw.todos
  const todos: { title: string; type: string; priority: string }[] = []
  if (Array.isArray(todosIn)) {
    for (const row of todosIn.slice(0, 8)) {
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      const title = typeof o.title === 'string' ? o.title.trim() : ''
      if (!title) continue
      const type = typeof o.type === 'string' ? o.type.trim() : '门店'
      const priority = typeof o.priority === 'string' ? o.priority.trim().toLowerCase() : 'medium'
      todos.push({ title, type, priority: priority === 'high' ? 'high' : 'medium' })
    }
  }
  const cqIn = raw.covered_queries ?? raw.coveredQueries
  const covered_queries: { q: string; covered: boolean }[] = []
  if (Array.isArray(cqIn)) {
    for (const row of cqIn.slice(0, 12)) {
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      const q = typeof o.q === 'string' ? o.q.trim() : ''
      if (!q) continue
      covered_queries.push({ q, covered: Boolean(o.covered) })
    }
  }
  return {
    infoCompletenessPercent,
    questionCoveragePercent,
    contentFreshnessPercent,
    rationale_zh: rationale_zh || '模型未给出摘要',
    todos,
    ...(covered_queries.length ? { covered_queries } : {}),
  }
}

export type GeoAiScoreResult =
  | { ok: false; message: string; needVendorKey?: string }
  | { ok: true; source: 'ai'; payload: GeoAiScorePayload }

/** 调用已绑定文本模型输出 GEO 三维度；网关解析失败时由调用方回退确定性算法 */
export async function postGeoAiScore(body: {
  model: AiModelId
  geo_score_context: string
  product_name?: string
}): Promise<GeoAiScoreResult> {
  const res = await postAiAssistFetch(
    buildAssistPayload({
      model: body.model,
      action: 'geo_ai_score',
      product_name: (body.product_name ?? 'GEO综合评分').trim().slice(0, 120),
      title_draft: 'geo_score',
      geo_score_context: body.geo_score_context.trim(),
    }),
  )
  const data = await parseJson(res)
  if (!res.ok) {
    return {
      ok: false,
      message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}`,
    }
  }
  if (data.ok === false) {
    const needVendorKey = parseNeedVendorKey(data)
    return {
      ok: false,
      message: typeof data.message === 'string' ? data.message : 'AI 请求失败',
      ...(needVendorKey ? { needVendorKey } : {}),
    }
  }
  const rawScore = data.geo_ai_score
  if (rawScore && typeof rawScore === 'object' && !Array.isArray(rawScore)) {
    const payload = normalizeGeoAiScorePayload(rawScore as Record<string, unknown>)
    if (payload) {
      return { ok: true, source: 'ai', payload }
    }
  }
  const parseErr =
    typeof data.geo_ai_parse_error === 'string' ? data.geo_ai_parse_error : '模型未返回可解析的 geo_ai_score'
  return {
    ok: false,
    message: parseErr,
  }
}

export type ProductQualityAnalysisResult =
  | { ok: false; message: string; needVendorKey?: string }
  | { ok: true; items: ProductQualityItem[]; parseError?: string; rawExcerpt?: string }

function coerceQualityItem(row: unknown): ProductQualityItem | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const dim = (x: unknown): QualityDimensionScore => {
    if (!x || typeof x !== 'object') return { score: 0, comment: '—' }
    const o = x as Record<string, unknown>
    const score = Math.min(100, Math.max(0, Math.round(Number(o.score))))
    const comment =
      typeof o.comment === 'string'
        ? o.comment
        : typeof o.summary === 'string'
          ? o.summary
          : '—'
    return { score: Number.isFinite(score) ? score : 0, comment }
  }
  const productId = String(r.productId ?? '').trim()
  const productName = String(r.productName ?? '').trim()
  if (!productId || !productName) return null
  const overall = Math.min(100, Math.max(0, Math.round(Number(r.overall))))
  const suggestions = Array.isArray(r.suggestions)
    ? r.suggestions.map((s) => String(s).trim()).filter(Boolean)
    : []
  const titleHeat = dim(r.titleHeat)
  const mainImage = dim(r.mainImage)
  const detailPage = dim(r.detailPage)
  const rec = r as Record<string, unknown>
  const rawPriceDim =
    rec.priceAnalysis ??
    rec.price_analysis ??
    rec.priceCompetitiveness ??
    rec.pricingAnalysis
  let priceAnalysis = dim(rawPriceDim)
  if (!rawPriceDim || typeof rawPriceDim !== 'object') {
    priceAnalysis = {
      score: Math.round((titleHeat.score + mainImage.score + detailPage.score) / 3),
      comment:
        '响应中未包含独立价格分析字段，暂以标题/主图/详情三项均分作参考；请重新跑质检以获取「价格分析」得分。',
    }
  }
  return {
    productId,
    productName,
    overall: Number.isFinite(overall) ? overall : 0,
    titleHeat,
    mainImage,
    detailPage,
    priceAnalysis,
    suggestions,
  }
}

const DEFAULT_QUALITY_TIMEOUT_MS = 90_000

/**
 * 使用豆包（火山方舟）对话模型，对已上传/已同步商品做多维度质量评分。
 * 经 `POST /api/merchant/kuaishou/goods/ai/assist` + action `analyze_product_quality`，密钥仅服务端 MERCHANT_AI_DOUBAO_KEY / ARK_API_KEY。
 */
export async function postKuaishouProductQualityAnalysis(
  products: QualityProductPayload[],
  opts?: {
    signal?: AbortSignal
    timeoutMs?: number
    pricingContext?: ProductQualityPricingContext
  },
): Promise<ProductQualityAnalysisResult> {
  if (products.length === 0) {
    return { ok: false, message: '没有可分析的商品' }
  }
  const body: AiAssistRequest = {
    model: 'doubao',
    action: 'analyze_product_quality',
    product_name: (products[0]?.name?.trim() || '商品质量分析').slice(0, 200),
    products: products.map((p, i) => {
      const id = p.id.trim() || `item-${i}`
      const name = (p.name?.trim() || `商品 ${id}`).slice(0, 200)
      return {
        id,
        name,
        ...(p.price_yuan !== undefined ? { price_yuan: p.price_yuan } : {}),
        ...(p.title?.trim() ? { title: p.title.trim() } : {}),
        ...(p.main_image_url?.trim() ? { main_image_url: p.main_image_url.trim() } : {}),
        ...(p.detail_excerpt?.trim() ? { detail_excerpt: p.detail_excerpt.trim() } : {}),
      }
    }),
    ...(opts?.pricingContext ? { pricing_context: opts.pricingContext } : {}),
  }

  const timeoutMs = opts?.timeoutMs ?? DEFAULT_QUALITY_TIMEOUT_MS
  const outer = opts?.signal
  const controller = new AbortController()
  const t = window.setTimeout(() => controller.abort(), timeoutMs)
  const onOuterAbort = () => controller.abort()
  if (outer) {
    if (outer.aborted) controller.abort()
    else outer.addEventListener('abort', onOuterAbort, { once: true })
  }

  let res: Response
  try {
    res = await postAiAssistFetch(buildAssistPayload(body), controller.signal)
  } catch (e) {
    const name = e instanceof DOMException ? e.name : e instanceof Error ? e.name : ''
    if (name === 'AbortError') {
      const cancelled = outer?.aborted === true
      return {
        ok: false,
        message: cancelled
          ? '已取消分析'
          : `请求超时（>${Math.round(timeoutMs / 1000)}s），请确认已运行带网关的开发服务（npm run dev）且网络可达`,
      }
    }
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  } finally {
    window.clearTimeout(t)
    outer?.removeEventListener('abort', onOuterAbort)
  }

  const data = await parseJson(res)
  if (!res.ok) {
    return {
      ok: false,
      message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}`,
    }
  }
  if (data.ok === false) {
    const needVendorKey = parseNeedVendorKey(data)
    return {
      ok: false,
      message: typeof data.message === 'string' ? data.message : 'AI 请求失败',
      ...(needVendorKey ? { needVendorKey } : {}),
    }
  }
  const rawItems = data.quality_items
  const parseErr =
    typeof data.quality_parse_error === 'string' ? data.quality_parse_error : undefined
  const rawExcerpt =
    typeof data.quality_raw_excerpt === 'string' ? data.quality_raw_excerpt : undefined
  if (!Array.isArray(rawItems)) {
    return {
      ok: false,
      message: parseErr || '响应缺少 quality_items',
    }
  }
  const items: ProductQualityItem[] = []
  for (const row of rawItems) {
    const it = coerceQualityItem(row)
    if (it) items.push(it)
  }
  if (items.length === 0 && parseErr) {
    return { ok: true, items: [], parseError: parseErr, rawExcerpt }
  }
  if (items.length === 0) {
    return { ok: false, message: parseErr || '未能解析质检结果' }
  }
  return { ok: true, items, parseError: parseErr, rawExcerpt }
}
