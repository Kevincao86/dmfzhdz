/**
 * 门店情报：菜单 OCR、竞品分析、商品方案（服务端；密钥仅 env）。
 */
import type { AIChatRequest } from '../src/services/ai/types.js'
import { verifyBearerJwt } from './aiGateway/authSupabase.js'
import { routeAiChat } from './aiGateway/chatRouter.js'

export type StoreMenuItemDto = {
  name: string
  priceYuan?: number
  category?: string
  note?: string
}

function extractJsonObject(text: string): Record<string, unknown> {
  const t = text.trim()
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced?.[1]?.trim() ?? t
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('模型未返回有效 JSON')
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
}

function parseMenuItems(obj: Record<string, unknown>): StoreMenuItemDto[] {
  const arr = obj.items ?? obj.menu_items ?? obj.dishes
  if (!Array.isArray(arr)) return []
  const out: StoreMenuItemDto[] = []
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const name = String(r.name ?? r.title ?? r.dish ?? '').trim()
    if (!name) continue
    const priceRaw = r.priceYuan ?? r.price_yuan ?? r.price
    let priceYuan: number | undefined
    if (typeof priceRaw === 'number' && Number.isFinite(priceRaw)) priceYuan = priceRaw
    else if (typeof priceRaw === 'string') {
      const n = Number.parseFloat(priceRaw.replace(/[^\d.]/g, ''))
      if (Number.isFinite(n)) priceYuan = n
    }
    out.push({
      name,
      ...(priceYuan != null ? { priceYuan } : {}),
      ...(r.category ? { category: String(r.category).trim() } : {}),
      ...(r.note ? { note: String(r.note).trim() } : {}),
    })
  }
  return out.slice(0, 200)
}

async function llmJson(
  env: Record<string, string>,
  system: string,
  user: string,
  imageDataUrls?: string[],
): Promise<Record<string, unknown>> {
  const hasVision = imageDataUrls && imageDataUrls.length > 0
  const tokenmixKey = (env.TOKENMIX_API_KEY ?? '').trim()
  const req: AIChatRequest = {
    provider: hasVision && tokenmixKey ? 'tokenmix' : 'doubao',
    ...(hasVision && tokenmixKey
      ? { modelFamily: 'openai' as const, model: 'gpt-4o' }
      : {}),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.35,
    ...(hasVision && imageDataUrls?.length ? { imageDataUrls: imageDataUrls.slice(0, 4) } : {}),
  }
  const res = await routeAiChat(req, env)
  return extractJsonObject(res.content)
}

export async function runStoreMenuRecognizeCore(
  bodyRaw: string,
  authHeader: string | undefined,
  env: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const session = await verifyBearerJwt(authHeader, env)
  if (!session) return { status: 401, body: { ok: false, error: 'unauthorized' } }

  let body: { imageDataUrl?: string; storeName?: string }
  try {
    body = JSON.parse(bodyRaw || '{}') as typeof body
  } catch {
    return { status: 400, body: { ok: false, error: 'invalid_json' } }
  }
  const image = String(body.imageDataUrl ?? '').trim()
  if (!image.startsWith('data:image/')) {
    return { status: 400, body: { ok: false, error: 'image_required' } }
  }

  const storeName = String(body.storeName ?? '').trim()
  const system = `你是餐饮/本地生活门店菜单识别助手。根据用户上传的菜单或价目表照片，提取结构化菜品列表。
只输出一个 JSON 对象，不要 markdown 其它说明。格式：
{"items":[{"name":"菜名","priceYuan":数字或省略,"category":"分类可选","note":"备注可选"}]}
价格统一为人民币元（数字）；看不清的项可省略 priceYuan；无法识别则 items 为空数组。`
  const userText = storeName
    ? `请识别「${storeName}」的菜单/价目表图片中的菜品与价格。`
    : '请识别菜单/价目表图片中的菜品与价格。'

  try {
    const obj = await llmJson(env, system, userText, [image])
    const items = parseMenuItems(obj)
    const notes = typeof obj.notes === 'string' ? obj.notes.trim() : undefined
    return {
      status: 200,
      body: { ok: true, items, ...(notes ? { notes } : {}) },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      status: 502,
      body: { ok: false, error: 'menu_recognize_failed', detail: msg.slice(0, 600) },
    }
  }
}

export async function runCompetitorAnalysisCore(
  bodyRaw: string,
  authHeader: string | undefined,
  env: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const session = await verifyBearerJwt(authHeader, env)
  if (!session) return { status: 401, body: { ok: false, error: 'unauthorized' } }

  let body: {
    storeName?: string
    address?: string
    city?: string
    industryHint?: string
    menuSummary?: string
  }
  try {
    body = JSON.parse(bodyRaw || '{}') as typeof body
  } catch {
    return { status: 400, body: { ok: false, error: 'invalid_json' } }
  }
  const storeName = String(body.storeName ?? '').trim()
  const address = String(body.address ?? '').trim()
  if (!storeName || !address) {
    return { status: 400, body: { ok: false, error: 'store_name_address_required' } }
  }

  const industryHint = String(body.industryHint ?? '').trim()
  const menuSummary = String(body.menuSummary ?? '').trim()
  const city = String(body.city ?? '').trim()

  const system = `你是本地生活商业分析师。根据门店地址与行业，推断其周边 3–8 公里内可能的同业竞争格局。
你没有实时地图数据：须基于地址语义、城市商圈常识做合理推断，并在 summary 中注明「基于公开信息与区位推断，非实时抓取」。
只输出 JSON：
{
  "summary": "一段话",
  "industryHint": "推断的主营品类",
  "competitors": [{"name":"店名或类型","distanceHint":"约x公里/同商圈","category":"品类","priceRange":"人均或套餐价区间","highlights":"卖点"}],
  "suggestions": ["给该门店的经营建议1","建议2"]
}`

  const userPrompt = [
    `门店：${storeName}`,
    `地址：${address}${city ? `（${city}）` : ''}`,
    industryHint ? `商家填写行业：${industryHint}` : '',
    menuSummary ? `本店菜单摘要：\n${menuSummary}` : '',
    '请分析周边竞争对手与定价带，并给出上架团购时的差异化建议。',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const obj = await llmJson(env, system, userPrompt)
    const summary = String(obj.summary ?? '').trim()
    const competitors = Array.isArray(obj.competitors) ? obj.competitors : []
    const suggestions = Array.isArray(obj.suggestions)
      ? obj.suggestions.map((s) => String(s)).filter(Boolean)
      : []
    return {
      status: 200,
      body: {
        ok: true,
        summary,
        industryHint: String(obj.industryHint ?? industryHint).trim() || undefined,
        competitors,
        suggestions,
      },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      status: 502,
      body: { ok: false, error: 'competitor_analysis_failed', detail: msg.slice(0, 600) },
    }
  }
}

export type ProductPlanDto = {
  productName: string
  suggestedPriceYuan: number
  originYuan?: number
  description: string
  comboLines: string[]
  marginNote?: string
  competitorNote?: string
  riskLevel?: 'low' | 'medium' | 'high'
}

export async function runAiProductPlanCore(
  bodyRaw: string,
  authHeader: string | undefined,
  env: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const session = await verifyBearerJwt(authHeader, env)
  if (!session) return { status: 401, body: { ok: false, error: 'unauthorized' } }

  let body: {
    userBrief?: string
    platform?: string
    storeName?: string
    menuSummary?: string
    margins?: { douyin: number; meituan: number; xhs: number }
    industryPath?: string
    competitorSummary?: string
  }
  try {
    body = JSON.parse(bodyRaw || '{}') as typeof body
  } catch {
    return { status: 400, body: { ok: false, error: 'invalid_json' } }
  }
  const userBrief = String(body.userBrief ?? '').trim()
  if (!userBrief) return { status: 400, body: { ok: false, error: 'user_brief_required' } }

  const margins = body.margins
  const marginLine = margins
    ? `商家配置综合毛利率（%）：抖音 ${margins.douyin}，美团 ${margins.meituan}，小红书 ${margins.xhs}。`
    : ''

  const system = `你是抖音来客团购商品策划。根据商家诉求、菜单与竞品信息，输出可上架的团购方案草案。
只输出 JSON：
{
  "productName": "团购标题",
  "suggestedPriceYuan": 数字,
  "originYuan": 数字或省略,
  "description": "详情说明（合规、无绝对化用语）",
  "comboLines": ["套餐项1","套餐项2"],
  "marginNote": "结合毛利率的定价说明",
  "competitorNote": "竞品对标一句",
  "riskLevel": "low|medium|high"
}
定价须考虑商家毛利率目标与周边竞品；套餐内容须与 userBrief 一致。`

  const userPrompt = [
    `平台：${String(body.platform ?? 'douyin').trim() || 'douyin'}`,
    body.storeName ? `门店：${body.storeName}` : '',
    body.industryPath ? `经营类目：${body.industryPath}` : '',
    marginLine,
    body.menuSummary ? `菜单参考：\n${body.menuSummary}` : '',
    body.competitorSummary ? `竞品分析：\n${body.competitorSummary}` : '',
    `商家诉求：${userBrief}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const obj = await llmJson(env, system, userPrompt)
    const productName = String(obj.productName ?? '').trim()
    const suggestedPriceYuan = Number(obj.suggestedPriceYuan)
    if (!productName || !Number.isFinite(suggestedPriceYuan)) {
      throw new Error('方案缺少 productName 或 suggestedPriceYuan')
    }
    const plan: ProductPlanDto = {
      productName,
      suggestedPriceYuan,
      description: String(obj.description ?? '').trim(),
      comboLines: Array.isArray(obj.comboLines)
        ? obj.comboLines.map((x) => String(x)).filter(Boolean)
        : [],
      ...(typeof obj.originYuan === 'number' ? { originYuan: obj.originYuan } : {}),
      ...(obj.marginNote ? { marginNote: String(obj.marginNote).trim() } : {}),
      ...(obj.competitorNote ? { competitorNote: String(obj.competitorNote).trim() } : {}),
      ...(obj.riskLevel === 'low' || obj.riskLevel === 'medium' || obj.riskLevel === 'high'
        ? { riskLevel: obj.riskLevel }
        : {}),
    }
    return { status: 200, body: { ok: true, plan } }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      status: 502,
      body: { ok: false, error: 'product_plan_failed', detail: msg.slice(0, 600) },
    }
  }
}
