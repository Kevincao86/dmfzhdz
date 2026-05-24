/**
 * 门店情报：菜单 OCR、竞品分析、商品方案（服务端；密钥仅 env）。
 */
import type { AIChatRequest } from '../src/services/ai/types.js'
import { verifyBearerJwt } from './aiGateway/authSupabase.js'
import { chatTokenMix } from './aiGateway/providers/tokenmix.js'
import { merchantAgentChatFromMessages } from './merchantAiUpstream.js'

export type StoreMenuItemDto = {
  name: string
  productCode?: string
  priceYuan?: number
  category?: string
  note?: string
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
  slotLabel?: string
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

function parsePriceYuan(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const n = Number.parseFloat(raw.replace(/[^\d.]/g, ''))
    if (Number.isFinite(n) && n > 0) return n
  }
  return undefined
}

function parseComboLinesFromApi(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const row of raw) {
    if (typeof row === 'string') {
      const s = row.trim()
      if (s && s !== '[object Object]') out.push(s)
      continue
    }
    if (row && typeof row === 'object') {
      const r = row as Record<string, unknown>
      const name = String(r.name ?? r.title ?? r.item ?? r.名称 ?? '').trim()
      if (name) out.push(name)
    }
  }
  return out
}

function parseMenuItems(obj: Record<string, unknown>): StoreMenuItemDto[] {
  const arr =
    obj.items ??
    obj.menu_items ??
    obj.dishes ??
    obj.menu ??
    obj.services ??
    obj.products ??
    (obj as Record<string, unknown>)['价目'] ??
    obj.list
  if (!Array.isArray(arr)) return []
  const out: StoreMenuItemDto[] = []
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const name = String(
      r.name ?? r.title ?? r.dish ?? r.service ?? r.item ?? r.名称 ?? r.项目 ?? '',
    ).trim()
    if (!name) continue
    const priceRaw = r.priceYuan ?? r.price_yuan ?? r.price ?? r.价格 ?? r.amount
    const priceYuan = parsePriceYuan(priceRaw)
    const codeRaw = String(
      r.productCode ??
        r.product_code ??
        r.sku ??
        r.code ??
        r.编号 ??
        r.商品编号 ??
        r.编码 ??
        '',
    ).trim()
    out.push({
      name,
      ...(codeRaw ? { productCode: codeRaw } : {}),
      ...(priceYuan != null ? { priceYuan } : {}),
      ...(r.category || r.分类
        ? { category: String(r.category ?? r.分类).trim() }
        : {}),
      ...(r.note || r.备注 ? { note: String(r.note ?? r.备注).trim() } : {}),
    })
  }
  return out.slice(0, 200)
}

function extractChatCompletionText(data: Record<string, unknown>): string {
  const choices = data.choices as unknown[] | undefined
  const first = choices?.[0] as Record<string, unknown> | undefined
  const message = first?.message as Record<string, unknown> | undefined
  if (typeof message?.content === 'string') return message.content.trim()
  const output = data.output as Record<string, unknown> | undefined
  if (typeof output?.text === 'string') return output.text.trim()
  return ''
}

function doubaoArkApiV3Root(env: Record<string, string>): string {
  const raw = (env.MERCHANT_AI_DOUBAO_ARK_BASE ?? '').trim().replace(/\/$/, '')
  if (!raw) return 'https://ark.cn-beijing.volces.com/api/v3'
  if (raw.endsWith('/api/v3')) return raw
  return `${raw}/api/v3`
}

/** OpenAI 兼容多模态对话（通义 compatible-mode / 火山方舟视觉模型） */
async function openAiVisionChat(
  url: string,
  apiKey: string,
  model: string,
  system: string,
  userText: string,
  imageDataUrls: string[],
): Promise<string> {
  const imgs = imageDataUrls.filter((u) => u.startsWith('data:image/')).slice(0, 4)
  const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = []
  for (const urlImg of imgs) {
    userContent.push({ type: 'image_url', image_url: { url: urlImg } })
  }
  userContent.push({ type: 'text', text: userText })
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      temperature: 0.35,
      stream: false,
    }),
  })
  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    const errObj = data.error as { message?: string } | undefined
    throw new Error(
      (typeof errObj?.message === 'string' && errObj.message) ||
        (typeof data.message === 'string' && data.message) ||
        `视觉模型 HTTP ${res.status}`,
    )
  }
  const text = extractChatCompletionText(data)
  if (!text) throw new Error('视觉模型返回为空')
  return text
}

/** 菜单识图必须走视觉模型；纯文本对话无法读图 */
async function llmJsonWithVision(
  env: Record<string, string>,
  system: string,
  userText: string,
  imageDataUrls: string[],
): Promise<Record<string, unknown>> {
  const imgs = imageDataUrls.filter((u) => u.startsWith('data:image/'))
  if (!imgs.length) throw new Error('缺少有效图片数据')

  const tokenmixKey = (env.TOKENMIX_API_KEY ?? '').trim()
  if (tokenmixKey) {
    const req: AIChatRequest = {
      provider: 'tokenmix',
      modelFamily: 'openai',
      model: (env.MERCHANT_AI_MENU_VISION_MODEL ?? 'gpt-4o').trim() || 'gpt-4o',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userText },
      ],
      temperature: 0.35,
      imageDataUrls: imgs.slice(0, 4),
    }
    const res = await chatTokenMix(req, env)
    return extractJsonObject(res.content)
  }

  const qwenKey = (env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim()
  const qwenModels = [
    (env.MERCHANT_AI_QWEN_VL_MODEL ?? '').trim(),
    'qwen-vl-plus',
    'qwen2.5-vl-72b-instruct',
    'qwen-vl-max',
  ].filter(Boolean)
  if (qwenKey) {
    let lastErr: Error | null = null
    for (const mid of qwenModels) {
      try {
        const text = await openAiVisionChat(
          'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
          qwenKey,
          mid,
          system,
          userText,
          imgs,
        )
        return extractJsonObject(text)
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e))
      }
    }
    throw lastErr ?? new Error('通义视觉模型识图失败')
  }

  const doubaoKey = (env.MERCHANT_AI_DOUBAO_KEY ?? env.ARK_API_KEY ?? '').trim()
  const doubaoModels = [
    (env.MERCHANT_AI_DOUBAO_VL_MODEL ?? '').trim(),
    'doubao-1-5-vision-pro-32k-250115',
    'doubao-seed-1-6-vision-250815',
    (env.MERCHANT_AI_DOUBAO_CHAT_MODEL ?? '').trim(),
  ].filter(Boolean)
  if (doubaoKey) {
    let lastErr: Error | null = null
    for (const mid of doubaoModels) {
      try {
        const text = await openAiVisionChat(
          `${doubaoArkApiV3Root(env)}/chat/completions`,
          doubaoKey,
          mid,
          system,
          userText,
          imgs,
        )
        return extractJsonObject(text)
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e))
      }
    }
    throw lastErr ?? new Error('豆包视觉模型识图失败')
  }

  throw new Error(
    '未配置菜单识图所需的视觉模型 Key：请在环境变量设置 TOKENMIX_API_KEY，或 MERCHANT_AI_QWEN_KEY / MERCHANT_AI_DOUBAO_KEY（通义 qwen-vl-plus 或豆包视觉模型）',
  )
}

/** 商品方案 JSON：优先通义/豆包直连（与商品 AI 同源），再 TokenMix；避免 DeepSeek thinking 导致 500 */
async function llmJson(
  env: Record<string, string>,
  system: string,
  user: string,
): Promise<Record<string, unknown>> {
  const errors: string[] = []
  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ]

  const qwenKey = (env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim()
  if (qwenKey) {
    try {
      const { text } = await merchantAgentChatFromMessages(env, 'qwen', undefined, system, user)
      return extractJsonObject(text)
    } catch (e) {
      errors.push(`通义：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const doubaoKey = (env.MERCHANT_AI_DOUBAO_KEY ?? env.ARK_API_KEY ?? '').trim()
  if (doubaoKey) {
    try {
      const { text } = await merchantAgentChatFromMessages(env, 'doubao', undefined, system, user)
      return extractJsonObject(text)
    } catch (e) {
      errors.push(`豆包：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const tokenmixKey = (env.TOKENMIX_API_KEY ?? '').trim()
  if (tokenmixKey) {
    try {
      const req: AIChatRequest = {
        provider: 'tokenmix',
        modelFamily: 'openai',
        model: (env.MERCHANT_AI_PLAN_JSON_MODEL ?? 'gpt-4o').trim() || 'gpt-4o',
        messages,
        temperature: 0.35,
      }
      const res = await chatTokenMix(req, env)
      return extractJsonObject(res.content)
    } catch (e) {
      errors.push(`TokenMix：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (!qwenKey && !doubaoKey && !tokenmixKey) {
    throw new Error(
      '未配置商品方案 LLM：请设置 MERCHANT_AI_QWEN_KEY / MERCHANT_AI_DOUBAO_KEY / DASHSCOPE_API_KEY / ARK_API_KEY / TOKENMIX_API_KEY 之一',
    )
  }
  throw new Error(errors.slice(0, 3).join('；') || '商品方案模型调用失败')
}

function planDtoFromLlmRow(
  row: Record<string, unknown>,
  slotLabel: string,
  userBrief: string,
): ProductPlanDto | null {
  const productName = String(row.productName ?? row.title ?? row.name ?? slotLabel).trim()
  let suggestedPriceYuan = parsePriceYuan(row.suggestedPriceYuan)
  if (!productName) return null
  if (suggestedPriceYuan == null) {
    const voucherM = userBrief.match(/(\d+)\s*代\s*(\d+)/)
    if (voucherM) suggestedPriceYuan = Number(voucherM[1])
    else if (/代金券/.test(slotLabel + userBrief)) suggestedPriceYuan = 15
    else return null
  }
  const originParsed = parsePriceYuan(row.originYuan)
  return {
    productName,
    suggestedPriceYuan,
    description: String(row.description ?? '').trim(),
    comboLines: parseComboLinesFromApi(row.comboLines),
    ...(originParsed != null ? { originYuan: originParsed } : {}),
    ...(row.riskLevel === 'low' || row.riskLevel === 'medium' || row.riskLevel === 'high'
      ? { riskLevel: row.riskLevel }
      : {}),
  }
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
  const system = `你是本地生活门店菜单/价目表识别助手。根据用户上传的照片，提取可上架或对外展示的服务项目与价格。
支持：餐饮菜品、口腔/医美/生活服务价目表、套餐项目清单等（不限于餐饮）。
只输出一个 JSON 对象，不要 markdown 其它说明。格式：
{"items":[{"name":"项目或菜品名称","productCode":"商品编号可选","priceYuan":数字或省略,"category":"分类/科室可选","note":"规格备注可选"}]}
价格统一为人民币元（数字，如 2980 写 2980）；能看清的条目尽量全部列出；看不清价格的可省略 priceYuan。`
  const userText = storeName
    ? `请识别「${storeName}」价目表/菜单图片中的全部可见项目与价格，按行逐项提取。`
    : '请识别价目表/菜单图片中的全部可见项目与价格，按行逐项提取。'

  try {
    const obj = await llmJsonWithVision(env, system, userText, [image])
    const items = parseMenuItems(obj)
    const notes = typeof obj.notes === 'string' ? obj.notes.trim() : undefined
    if (items.length === 0) {
      return {
        status: 200,
        body: {
          ok: true,
          items: [],
          empty: true,
          notes:
            notes ||
            '模型未从图中解析出结构化条目，请确认已配置视觉模型 Key，或换角度/更高分辨率重试。',
        },
      }
    }
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

function formatExcelRowsForLlm(rows: string[][], maxRows = 320): string {
  const slice = rows.slice(0, maxRows)
  const lines = slice.map((row, i) => {
    const cells = row.map((c) => String(c ?? '').replace(/\t/g, ' ').trim())
    return `R${i + 1}\t${cells.join('\t')}`
  })
  if (rows.length > maxRows) {
    lines.push(`…共 ${rows.length} 行，仅展示前 ${maxRows} 行`)
  }
  return lines.join('\n')
}

export async function runStoreMenuExcelRecognizeCore(
  bodyRaw: string,
  authHeader: string | undefined,
  env: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const session = await verifyBearerJwt(authHeader, env)
  if (!session) return { status: 401, body: { ok: false, error: 'unauthorized' } }

  let body: { rows?: unknown; fileName?: string; sheetName?: string; storeName?: string }
  try {
    body = JSON.parse(bodyRaw || '{}') as typeof body
  } catch {
    return { status: 400, body: { ok: false, error: 'invalid_json' } }
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return { status: 400, body: { ok: false, error: 'rows_required' } }
  }

  const rows: string[][] = []
  for (const row of body.rows) {
    if (!Array.isArray(row)) continue
    const cells = row.map((c) => String(c ?? '').trim())
    if (cells.some((c) => c.length > 0)) rows.push(cells)
  }
  if (rows.length === 0) {
    return { status: 400, body: { ok: false, error: 'empty_sheet' } }
  }
  if (rows.length > 800) {
    return {
      status: 400,
      body: {
        ok: false,
        error: 'too_many_rows',
        detail: `检测到 ${rows.length} 行有效数据，单次最多 800 行，请拆分文件后重试`,
      },
    }
  }

  const storeName = String(body.storeName ?? '').trim()
  const fileName = String(body.fileName ?? '').trim()
  const sheetName = String(body.sheetName ?? '').trim()
  const system = `你是门店价目表/商品清单 Excel 表格解析助手。用户会提供从 Excel/CSV 导出的行数据（Tab 分隔列），可能有表头、合并单元格遗留空列、分类小标题行等。
请智能识别每一有效数据行的：品名/项目名称(name)、商品编号/SKU/编码(productCode)、价格(priceYuan)、分类(category)、备注(note)。
规则：
- 跳过表头行、合计/小计行、纯分类标题行（无价格的单行标题可当作下一行的 category 上下文，或直接忽略）
- 价格统一为人民币元（数字）；「¥128」「128元」等转为 128
- 能识别商品编号、条码、SKU、货号、编码等列时填入 productCode
- 只输出一个 JSON 对象，不要 markdown。格式：
{"items":[{"name":"名称","productCode":"编号可选","priceYuan":数字或省略,"category":"分类可选","note":"备注可选"}]}
尽量提取全部有效商品/服务项目，最多 200 条。`

  const meta = [
    fileName ? `文件名：${fileName}` : '',
    sheetName ? `工作表：${sheetName}` : '',
    storeName ? `门店：${storeName}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const userText = `${meta ? `${meta}\n\n` : ''}以下为表格行（R行号\\t列1\\t列2…）：\n${formatExcelRowsForLlm(rows)}`

  try {
    const obj = await llmJson(env, system, userText)
    const items = parseMenuItems(obj)
    const notes = typeof obj.notes === 'string' ? obj.notes.trim() : undefined
    if (items.length === 0) {
      return {
        status: 200,
        body: {
          ok: true,
          items: [],
          empty: true,
          notes:
            notes ||
            '模型未能从表格中解析出有效条目，请检查列是否含品名/价格，或尝试整理表头后重新上传。',
        },
      }
    }
    return {
      status: 200,
      body: { ok: true, items, ...(notes ? { notes } : {}) },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      status: 502,
      body: { ok: false, error: 'menu_excel_recognize_failed', detail: msg.slice(0, 600) },
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
    industryPath?: string
    industryName?: string
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

  const industryPath = String(body.industryPath ?? body.industryHint ?? '').trim()
  const industryName = String(body.industryName ?? '').trim()
  const boundIndustry = industryPath || industryName
  const menuSummary = String(body.menuSummary ?? '').trim()
  const city = String(body.city ?? '').trim()

  const industryRules = boundIndustry
    ? `【硬性规则 · 商家已绑定经营类目】
- 绑定类目「${boundIndustry}」是分析的唯一主营行业依据；industryHint 必须原样输出该类目（可含完整路径），禁止改写成餐饮、饮品、奶茶等其他品类。
- 竞品必须是同一行业或直接替代的同业态门店/连锁（例：类目含「商超便利」「数码家电」「3C」时，竞品应为便利店、超市、3C 数码店、手机卖场、生活电器集合店等；禁止输出喜茶、奈雪、茶颜悦色、咖啡、火锅等餐饮连锁）。
- 每个竞品的 category 须与绑定类目一致或为其子类；hotProducts 须符合该竞品业态（如数码店推手机/配件套餐，便利店推关东煮/便当/日用品团购等）。
- 门店名称仅作参考，不得因店名或地址商圈常识覆盖绑定类目。`
    : `若未提供绑定类目，可结合门店名与地址推断主营品类；industryHint 输出推断结果。`

  const system = `你是本地生活商业分析师。根据门店地址与经营类目，推断其周边 3–8 公里内可能的同业竞争格局。
你没有实时地图数据：须基于地址语义、城市商圈常识做合理推断，并在 summary 中注明「基于公开信息与区位推断，非实时抓取」。
${industryRules}
只输出 JSON：
{
  "summary": "一段话",
  "industryHint": "${boundIndustry ? '必须与商家绑定经营类目完全一致' : '推断的主营品类'}",
  "competitors": [{"name":"店名或类型","distanceHint":"约x公里/同商圈","category":"品类","priceRange":"人均或套餐价区间","highlights":"卖点","hotProducts":[{"name":"热销团购/外卖商品名","priceYuan":39.9,"channel":"团购或外卖或到店","note":"可选：销量/套餐说明"}]}],
  "suggestions": ["给该门店的经营建议1","建议2"]
}`

  const userPrompt = [
    `门店：${storeName}（店名仅供参考，行业以绑定类目为准）`,
    `地址：${address}${city ? `（${city}）` : ''}`,
    boundIndustry
      ? `【绑定经营类目 · 必须遵守】${boundIndustry}${industryName && industryName !== industryPath ? `（${industryName}）` : ''}`
      : '',
    menuSummary ? `本店菜单摘要：\n${menuSummary}` : '',
    boundIndustry
      ? '请严格按绑定经营类目分析周边同业竞品与定价带，禁止输出跨行业竞品（尤其禁止茶饮/咖啡等）。为每个竞品推断 2–4 个符合其业态的团购/外卖热销商品（含大致售价），并给出差异化建议。'
      : '请分析周边竞争对手与定价带，并为每个竞品推断 2–4 个当地常见的团购/外卖热销商品（含大致售价），供后续 AI 组品参考；并给出上架团购时的差异化建议。',
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
        industryHint: boundIndustry || String(obj.industryHint ?? '').trim() || undefined,
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

export async function runAiProductPlanCore(
  bodyRaw: string,
  authHeader: string | undefined,
  env: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const session = await verifyBearerJwt(authHeader, env)
  if (!session) return { status: 401, body: { ok: false, error: 'unauthorized' } }

  let body: {
    userBrief?: string
    intentLabels?: string[]
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

  const intentLabels = Array.isArray(body.intentLabels)
    ? body.intentLabels.map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
    : []

  const batchMode = intentLabels.length > 1

  const systemSingle = `你是抖音来客团购商品策划。根据商家诉求、菜单与竞品信息，输出可上架的团购方案草案。
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
定价须考虑商家毛利率目标与周边竞品；套餐内容须与 userBrief 一致。
代金券须给出 suggestedPriceYuan（售价）与 originYuan（面值）；用户未写明代金面额时，结合毛利率给出合理售价与面值（如 15 代 20）。
多人套餐须按餐型区分 comboLines 与售价，勿合并到一项。`

  const systemBatch = `你是抖音来客团购商品策划。根据商家诉求、菜单与毛利率，一次性输出多个上架方案。
只输出 JSON：
{
  "plans": [
    {
      "slotLabel": "与请求的标签一致，如单人套餐",
      "productName": "团购标题",
      "suggestedPriceYuan": 数字,
      "originYuan": 数字或省略,
      "description": "详情说明",
      "comboLines": ["项1","项2"],
      "riskLevel": "low|medium|high"
    }
  ]
}
必须为每个 slotLabel 各生成一项，slotLabel 必须与用户给定列表完全一致，顺序一致，不得遗漏或合并。`

  const userPrompt = [
    `平台：${String(body.platform ?? 'douyin').trim() || 'douyin'}`,
    body.storeName ? `门店：${body.storeName}` : '',
    body.industryPath ? `经营类目：${body.industryPath}` : '',
    marginLine,
    body.menuSummary ? `菜单参考：\n${body.menuSummary}` : '',
    body.competitorSummary ? `竞品分析：\n${body.competitorSummary}` : '',
    batchMode ? `需生成的商品标签（各一项）：${intentLabels.join('、')}` : '',
    `商家诉求：${userBrief}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const obj = await llmJson(env, batchMode ? systemBatch : systemSingle, userPrompt)

    if (batchMode) {
      const rawPlans = obj.plans ?? obj.items
      if (!Array.isArray(rawPlans)) {
        throw new Error('批量方案缺少 plans 数组')
      }
      const plans: ProductPlanDto[] = []
      for (const label of intentLabels) {
        const row =
          rawPlans.find((p) => {
            if (!p || typeof p !== 'object') return false
            const sl = String((p as Record<string, unknown>).slotLabel ?? '').trim()
            return sl === label
          }) ?? rawPlans[intentLabels.indexOf(label)]
        const parsed =
          row && typeof row === 'object'
            ? planDtoFromLlmRow(row as Record<string, unknown>, label, userBrief)
            : null
        if (parsed) {
          plans.push({ ...parsed, slotLabel: label })
        }
      }
      if (!plans.length) {
        throw new Error('批量方案解析为空')
      }
      return { status: 200, body: { ok: true, plans } }
    }

    const single = planDtoFromLlmRow(obj, intentLabels[0] ?? '商品方案', userBrief)
    if (!single) {
      throw new Error('方案缺少 productName 或 suggestedPriceYuan')
    }
    return { status: 200, body: { ok: true, plan: single } }
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === 'string'
          ? e
          : JSON.stringify(e).slice(0, 600)
    return {
      status: 502,
      body: { ok: false, error: 'product_plan_failed', detail: msg.slice(0, 600) },
    }
  }
}
