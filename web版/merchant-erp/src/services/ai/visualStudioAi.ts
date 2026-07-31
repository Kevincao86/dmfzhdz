/**
 * 视觉工坊 AI 接入：文案（LLM）+ 生图 Prompt 打包（LLM）+ 生图（postAiAgentNativeImage）
 * 高级 GPT Image：phase=start/poll 短轮询，禁止回退万相。
 */
import { postAiChat } from './aiClient'
import type { CopySuggestion, PublishChannelId, VisualStudioForm, VisualStudioReferenceAnalysis } from '../../lib/aiImageStudioPresets'
import {
  buildVisualStudioImageContext,
  buildVisualStudioPrompt,
  formatReferenceAnalysisForPrompt,
  generateCopySuggestions,
  nonCateringFoodBanLine,
  PUBLISH_CHANNELS,
  resolveIndustrySceneContext,
  resolvePlaybook,
  resolvePlaybookVariant,
} from '../../lib/aiImageStudioPresets'
import { merchantApiAuthHeaders, resolveMerchantApiBearer } from '../../lib/merchantApiAuth'
import { merchantErpApiCandidates } from '../../lib/merchantErpApiBase'
import { fetchPrimaryTenantId } from '../../lib/tenantBilling'
import { supabase, supabaseConfigured } from '../../lib/supabaseClient'
import { VISUAL_STUDIO_PRO_IMAGE_MODEL } from '../../lib/mpPointsEconomics'

function stripJsonFence(raw: string): string {
  const t = raw.trim()
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  return (m?.[1] ?? t).trim()
}

function extractJsonObjectPayload(text: string): Record<string, unknown> | null {
  const cleaned = stripJsonFence(text)
  try {
    const parsed = JSON.parse(cleaned) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    /* try brace extract */
  }
  const brace = cleaned.match(/\{[\s\S]*\}/)
  if (brace) {
    try {
      const parsed = JSON.parse(brace[0]) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

function pickStringField(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

function pickStringArrayField(o: Record<string, unknown>, keys: string[]): string[] {
  for (const k of keys) {
    const v = o[k]
    if (Array.isArray(v)) {
      return v
        .map((x) => (typeof x === 'string' ? x.trim() : ''))
        .filter(Boolean)
        .slice(0, 12)
    }
  }
  return []
}

function normalizeReferenceAnalysis(raw: unknown): VisualStudioReferenceAnalysis | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const subject = pickStringField(o, ['subject', '主体', 'mainSubject', 'coreSubject'])
  const elements = pickStringArrayField(o, ['elements', 'keyElements', '核心元素', 'items'])
  const colors = pickStringField(o, ['colors', 'colorPalette', '主色调', '色调'])
  const texture = pickStringField(o, ['texture', 'material', '质感', '材质'])
  const composition = pickStringField(o, ['composition', 'layout', '构图'])
  const mood = pickStringField(o, ['mood', 'atmosphere', '氛围'])
  const mergeInstruction = pickStringField(o, ['mergeInstruction', 'merge', '合成要求', '合成指令'])
  if (!subject && !elements.length && !colors && !mergeInstruction) return null
  return {
    subject: subject || '参考图主体',
    elements,
    colors,
    texture,
    composition,
    mood,
    mergeInstruction:
      mergeInstruction ||
      '将参考图中的核心商品/人物/场景元素提取并自然融入新海报，保持真实质感与品类识别度，文案以表单为准。',
  }
}

export type VisualStudioReferenceAnalysisResult =
  | { ok: true; analysis: VisualStudioReferenceAnalysis; source: 'ai' }
  | { ok: false; message: string }

/** 视觉模型理解参考图核心元素，供并入生图 Prompt */
export async function analyzeVisualStudioReferenceImage(
  imageDataUrl: string,
  form: VisualStudioForm,
  opts?: { signal?: AbortSignal },
): Promise<VisualStudioReferenceAnalysisResult> {
  const sceneCtx = resolveIndustrySceneContext(form)
  const foodBan = form.industry === 'catering' ? '' : nonCateringFoodBanLine(form.industry, form.industrySubId)
  const subjectHint =
    form.industry === 'catering'
      ? '商品/菜品/环境/人物'
      : form.industrySubId === 'leisure_foot_spa'
        ? '足浴空间/服务场景/人物'
        : '商品/服务场景/环境/人物'
  const elementHint =
    form.industry === 'catering'
      ? '如具体菜品名、道具、招牌色块'
      : '如空间道具、服务动作、门店色块、材质'
  const jsonExample =
    '{"subject":"","elements":[],"colors":"","texture":"","composition":"","mood":"","mergeInstruction":""}'
  const userPrompt = [
    `你是本地生活营销海报的视觉分析师。请理解用户上传的参考图，提取可并入新海报的核心元素。`,
    '',
    `业态：${sceneCtx.label}（${sceneCtx.sceneHint}）`,
    foodBan,
    form.storeName.trim() ? `门店/品牌：${form.storeName.trim()}` : '',
    '',
    '请输出 JSON（不要 markdown），字段：',
    `- subject：画面主体（${subjectHint}，一句话）`,
    `- elements：须保留并入新图的关键元素数组（3～8 项，${elementHint}）`,
    '- colors：主色调与配色',
    '- texture：材质与真实质感描述',
    '- composition：构图与景别参考',
    '- mood：氛围',
    '- mergeInstruction：如何将这些元素合成进新营销海报（中文，50～120 字；须符合业态，非餐饮禁止写成菜品合成）',
    '',
    `格式示例：${jsonExample}`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const res = await postAiChat(
      {
        provider: 'qwen',
        messages: [
          {
            role: 'system',
            content:
              '你是图像理解助手。只输出合法 JSON 对象，字段名必须为 subject、elements、colors、texture、composition、mood、mergeInstruction。',
          },
          { role: 'user', content: userPrompt },
        ],
        imageDataUrls: [imageDataUrl],
        stream: false,
        taskType: 'generate_copywriting',
        temperature: 0.2,
      },
      { signal: opts?.signal },
    )
    const obj = extractJsonObjectPayload(res.content)
    const analysis = normalizeReferenceAnalysis(obj)
    if (analysis) {
      return { ok: true, analysis, source: 'ai' }
    }
    return { ok: false, message: 'AI 未能解析参考图，将仅按参考图色调对齐' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      message: msg.includes('abort') ? '已取消' : `参考图理解失败：${msg.slice(0, 100)}`,
    }
  }
}

function normalizeCopyRow(row: unknown): CopySuggestion | null {
  if (!row || typeof row !== 'object') return null
  const o = row as Record<string, unknown>
  const headline =
    typeof o.headline === 'string'
      ? o.headline.trim()
      : typeof o.title === 'string'
        ? o.title.trim()
        : typeof o.主标题 === 'string'
          ? o.主标题.trim()
          : ''
  if (!headline) return null
  const pick = (keys: string[]) => {
    for (const k of keys) {
      const v = o[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return ''
  }
  return {
    headline,
    subheadline: pick(['subheadline', 'subtitle', '副标题']),
    offer: pick(['offer', 'price', '优惠', '价格']),
    timeRange: pick(['timeRange', 'time', '活动时间']),
    note: pick(['note', 'remark', '备注']),
  }
}

function extractJsonArrayPayload(text: string): unknown[] | null {
  const cleaned = stripJsonFence(text)
  try {
    const parsed = JSON.parse(cleaned) as unknown
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object') {
      const o = parsed as Record<string, unknown>
      for (const key of ['items', 'data', 'suggestions', 'copy', 'result', '文案', 'list']) {
        if (Array.isArray(o[key])) return o[key] as unknown[]
      }
      const single = normalizeCopyRow(parsed)
      if (single) return [parsed]
    }
  } catch {
    /* try bracket extract */
  }
  const bracket = cleaned.match(/\[[\s\S]*\]/)
  if (bracket) {
    try {
      const arr = JSON.parse(bracket[0]) as unknown
      if (Array.isArray(arr)) return arr
    } catch {
      /* ignore */
    }
  }
  return null
}

function parseCopySuggestionsFromAi(text: string): CopySuggestion[] | null {
  const raw = text.trim()
  if (!raw) return null

  const rows = extractJsonArrayPayload(raw)
  if (rows) {
    const out: CopySuggestion[] = []
    for (const row of rows.slice(0, 3)) {
      const item = normalizeCopyRow(row)
      if (item) out.push(item)
    }
    if (out.length) return out
  }

  /** 兜底：模型返回纯文本分块（标题行 + 副标题） */
  const blocks = raw
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length >= 4 && !/^```/.test(b))
  if (blocks.length >= 2) {
    const out: CopySuggestion[] = []
    for (const block of blocks.slice(0, 3)) {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
      const headline = lines[0]?.replace(/^[\d一二三四五六七八九十]+[.、)\]]\s*/, '') ?? ''
      if (headline.length >= 2 && headline.length <= 24) {
        out.push({
          headline,
          subheadline: lines[1] ?? '',
          offer: lines[2] ?? '',
        })
      }
    }
    if (out.length) return out
  }

  return null
}

export type VisualStudioAiCopyResult =
  | { ok: true; items: CopySuggestion[]; source: 'ai' | 'local' }
  | { ok: false; message: string; fallback: CopySuggestion[] }

/**
 * 文案包应秒级返回。上游现用 qwen3.7-flash（关思考）约 2～3s；
 * 预留鉴权/网络余量，超时再回退本地模板。
 */
const VISUAL_STUDIO_COPY_AI_TIMEOUT_MS = 20_000
/** 付费可用的快模型；通用 qwen-plus/turbo 免费额度耗尽会 403 */
const VISUAL_STUDIO_COPY_AI_MODEL = 'qwen3.7-flash'

function combineAbortWithTimeout(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; didTimeout: () => boolean; dispose: () => void } {
  const ac = new AbortController()
  let timedOut = false
  const onExternal = () => ac.abort()
  if (external?.aborted) {
    ac.abort()
  } else {
    external?.addEventListener('abort', onExternal, { once: true })
  }
  const timer = setTimeout(() => {
    timedOut = true
    ac.abort()
  }, timeoutMs)
  return {
    signal: ac.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternal)
    },
  }
}

/** 调用智能体 LLM 生成 3 套海报文案，失败则回退本地模板 */
export async function fetchVisualStudioCopyFromAi(
  form: VisualStudioForm,
  opts?: { signal?: AbortSignal },
): Promise<VisualStudioAiCopyResult> {
  const fallback = generateCopySuggestions(form)
  const sceneCtx = resolveIndustrySceneContext(form)
  const pb = resolvePlaybook(form.playbook)
  const variant = resolvePlaybookVariant(
    form.playbook,
    form.playbookVariantId,
    form.industry,
    form.industrySubId,
  )
  const channels = form.channels
    .map((id) => PUBLISH_CHANNELS.find((c) => c.id === id)?.label ?? id)
    .join('、')

  const jsonExample = '[{"headline":"","subheadline":"","offer":"","timeRange":"","note":""}]'
  const userPrompt = [
    `你是中国大陆本地生活商家营销文案专家。请为「${sceneCtx.label}」门店生成 3 套海报文案。`,
    '',
    `门店名：${form.storeName.trim() || '（未填，可用「本店」）'}`,
    `营销玩法：${pb.label}（${pb.desc}）`,
    variant ? `活动细分：${variant.label}（${variant.periodLabel}）` : '',
    `投放平台：${channels || '抖音'}`,
    `当前主标题参考：${form.headline.trim() || '（待生成）'}`,
    '',
    '要求：',
    '1. 每套含 headline（主标题≤12字）、subheadline、offer、timeRange、note',
    `2. 文案必须符合${sceneCtx.label}行业语感（${sceneCtx.sceneHint}），禁止出现与业态不符的用语`,
    `3. 适合${pb.label}场景，可直接用于 AI 海报生图`,
    `4. 只输出 JSON 数组，不要 markdown 代码块，不要任何解释文字，格式：${jsonExample}`,
    '',
    '生成 3 套风格略有差异的方案。',
  ]
    .filter(Boolean)
    .join('\n')

  const gate = combineAbortWithTimeout(opts?.signal, VISUAL_STUDIO_COPY_AI_TIMEOUT_MS)
  try {
    const res = await postAiChat(
      {
        provider: 'qwen',
        model: VISUAL_STUDIO_COPY_AI_MODEL,
        messages: [
          {
            role: 'system',
            content:
              '你是营销文案生成器。只输出合法 JSON 数组，字段名必须为 headline、subheadline、offer、timeRange、note，禁止 markdown 与其它说明文字。',
          },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        taskType: 'generate_copywriting',
        temperature: 0.4,
      },
      { signal: gate.signal },
    )
    const parsed = parseCopySuggestionsFromAi(res.content)
    if (parsed?.length) {
      return { ok: true, items: parsed, source: 'ai' }
    }
    return {
      ok: false,
      message: 'AI 返回格式无法解析，已使用本地文案包',
      fallback,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const aborted = /abort/i.test(msg) || e instanceof DOMException
    if (aborted && gate.didTimeout()) {
      return { ok: false, message: 'AI 文案超时，已使用本地文案包', fallback }
    }
    return {
      ok: false,
      message: aborted ? '已取消' : `AI 文案暂不可用：${msg.slice(0, 120)}`,
      fallback,
    }
  } finally {
    gate.dispose()
  }
}

function localReferenceKeywordsFallback(form: VisualStudioForm): string {
  const pb = resolvePlaybook(form.playbook)
  const sceneCtx = resolveIndustrySceneContext(form)
  const parts = [
    sceneCtx.label,
    pb.label,
    form.headline.trim(),
    form.offer.trim(),
    form.styleId,
  ].filter(Boolean)
  return parts.slice(0, 8).join('、')
}

export type VisualStudioReferenceKeywordsResult =
  | { ok: true; keywords: string; source: 'ai' | 'local' }
  | { ok: false; message: string; fallback: string }

/** AI 根据业态/玩法/文案生成参考关键词（可手改），失败回退本地拼接 */
export async function fetchVisualStudioReferenceKeywordsFromAi(
  form: VisualStudioForm,
  opts?: { signal?: AbortSignal; referenceAnalysis?: VisualStudioReferenceAnalysis | null },
): Promise<VisualStudioReferenceKeywordsResult> {
  const fallback = localReferenceKeywordsFallback(form)
  const sceneCtx = resolveIndustrySceneContext(form)
  const pb = resolvePlaybook(form.playbook)
  const variant = resolvePlaybookVariant(
    form.playbook,
    form.playbookVariantId,
    form.industry,
    form.industrySubId,
  )
  const refHint = opts?.referenceAnalysis
    ? [
        opts.referenceAnalysis.subject,
        ...(opts.referenceAnalysis.elements || []).slice(0, 4),
        opts.referenceAnalysis.mood,
      ]
        .filter(Boolean)
        .join('、')
    : ''

  const userPrompt = [
    '你是本地生活营销海报的视觉关键词助手。请根据下列条件输出 6～12 个中文参考关键词（用顿号或逗号分隔的一行）。',
    '关键词须利于文生图：含场景、道具、光影、色调、氛围、构图倾向；不要整句广告文案。',
    `业态：${sceneCtx.label}（${sceneCtx.sceneHint}）`,
    nonCateringFoodBanLine(form.industry, form.industrySubId),
    `玩法：${pb.label}`,
    variant ? `细分：${variant.label}` : '',
    form.storeName.trim() ? `门店：${form.storeName.trim()}` : '',
    form.headline.trim() ? `主标题：${form.headline.trim()}` : '',
    form.subheadline.trim() ? `副标题：${form.subheadline.trim()}` : '',
    form.offer.trim() ? `优惠：${form.offer.trim()}` : '',
    refHint ? `参考图理解：${refHint}` : '',
    '只输出关键词一行，不要编号、不要解释。',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const res = await postAiChat(
      {
        provider: 'qwen',
        model: VISUAL_STUDIO_COPY_AI_MODEL,
        messages: [
          {
            role: 'system',
            content: '你只输出一行中文关键词，用顿号分隔，禁止其它文字。',
          },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        taskType: 'generate_copywriting',
        temperature: 0.45,
      },
      { signal: opts?.signal },
    )
    const keywords = stripPromptFence(res.content)
      .replace(/^关键词[：:]\s*/i, '')
      .replace(/\n+/g, '、')
      .trim()
    if (keywords.length >= 4) {
      return { ok: true, keywords: keywords.slice(0, 200), source: 'ai' }
    }
    return { ok: false, message: 'AI 关键词过短，已使用本地关键词', fallback }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      message: msg.includes('abort') ? '已取消' : `AI 关键词暂不可用：${msg.slice(0, 100)}`,
      fallback,
    }
  }
}

export type VisualStudioImagePromptResult =
  | { ok: true; prompt: string; source: 'ai' | 'local' }
  | { ok: false; message: string; fallback: string }

function stripPromptFence(raw: string): string {
  const t = raw.trim()
  const m = t.match(/```(?:text|markdown)?\s*([\s\S]*?)```/)
  return (m?.[1] ?? t).trim()
}

/**
 * 调用 LLM 将视觉工坊全部业务信息打包为文生图 Prompt（失败回退本地模板）。
 */
export async function fetchVisualStudioImagePromptFromAi(
  form: VisualStudioForm,
  opts?: {
    channel?: PublishChannelId
    variantIndex?: number
    productRefCount?: number
    styleFromReference?: boolean
    referenceAnalysis?: VisualStudioReferenceAnalysis | null
    refineNote?: string
    signal?: AbortSignal
    carouselMaster?: boolean
  },
): Promise<VisualStudioImagePromptResult> {
  const fallback = buildVisualStudioPrompt(form, opts)
  const ctx = buildVisualStudioImageContext(form, opts)
  const ctxJson = JSON.stringify(ctx, null, 2)
  const refBlock = opts?.referenceAnalysis
    ? formatReferenceAnalysisForPrompt(opts.referenceAnalysis)
    : ''
  const foodBan = nonCateringFoodBanLine(form.industry, form.industrySubId)

  const userPrompt = [
    '你是中国大陆本地生活营销海报的「生图 Prompt 工程师」。请根据下列 JSON 业务上下文，输出一段可直接交给文生图模型的中文 Prompt。',
    '',
    '要求：',
    '1. 单段连贯描述，300～600 字，不要 JSON、不要 markdown、不要编号列表',
    '2. 必须锁定业态与场景：画面主体/环境/道具与 industry、industrySceneHint 一致，严禁业态错配（足浴/足疗须为足浴沙发/足疗椅场景，禁止浴缸/酒店客房/海边度假；餐饮禁止足疗场景）',
    foodBan ? `2b. ${foodBan}` : '',
    opts?.carouselMaster
      ? '3. 画面中文只能使用 JSON 里非空的 headline/subheadline/offer/storeName/note；offer 为空则禁止任何价格与卖点列表'
      : '3. 必须体现 headline、offer、subheadline 等已填文案为画面中的中文大字信息',
    opts?.carouselMaster
      ? '4. carouselMaster=true：只描述一张同一室内场景从左到右连续延展的超宽全景（左中右空间内容必须不同）；严禁三宫格、三张相同海报并排、画面写「三连图」；生成后裁成 1～3'
      : '4. 体现 styleHint、compositionVariant、渠道尺寸与 playbook 玩法',
    '5. 若有 productRefCount>0 或 styleFromReference，强调与参考图品类色调一致（非餐饮参考图不得被理解成菜品）',
    form.referenceKeywords.trim()
      ? `5b. 必须把参考关键词融入画面元素/氛围：${form.referenceKeywords.trim()}`
      : '',
    refBlock || form.referenceKeywords.trim()
      ? '5c. 若同时有参考图理解结果与参考关键词：综合两者，并严格服从上方业态/玩法/文案条件，禁止只复刻参考图'
      : '',
    refBlock
      ? '6. 必须严格遵循下方「参考图核心元素」：提取的主体/元素须自然融入新海报，不可忽略'
      : '6. 结尾注明：专业海报排版、中文清晰可读、无水印乱码',
    refBlock ? '' : '',
    refBlock ? `【参考图核心元素】\n${refBlock}` : '',
    refBlock ? '7. 结尾注明：专业海报排版、中文清晰可读、无水印乱码' : '',
    '',
    '业务上下文 JSON：',
    ctxJson,
  ]
    .filter((line) => line !== '')
    .join('\n')

  try {
    const res = await postAiChat(
      {
        provider: 'qwen',
        messages: [
          {
            role: 'system',
            content:
              form.industry === 'catering'
                ? '你只输出一段中文文生图 Prompt 正文，禁止任何解释、前缀后缀、代码块。Prompt 须让模型生成与业态严格匹配的营销海报。'
                : '你只输出一段中文文生图 Prompt 正文，禁止任何解释、前缀后缀、代码块。Prompt 须让模型生成与业态严格匹配的营销海报；严禁描述菜品、餐桌、摆盘等餐饮画面。',
          },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        taskType: 'generate_copywriting',
        temperature: 0.35,
      },
      { signal: opts?.signal },
    )
    const prompt = stripPromptFence(res.content)
    if (prompt.length >= 80) {
      return { ok: true, prompt, source: 'ai' }
    }
    return { ok: false, message: 'AI Prompt 过短，已使用本地模板', fallback }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      message: msg.includes('abort') ? '已取消' : `AI 整理出图需求失败：${msg.slice(0, 120)}`,
      fallback,
    }
  }
}

export type VisualStudioGptImageResult =
  | { ok: true; imageUrl: string; channel: 'tokenmix'; displayModel?: string }
  | { ok: false; message: string }

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function isFetchNetworkError(msg: string): boolean {
  return /Failed to fetch|fetch failed|NetworkError|Load failed|network error|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket|aborted|AbortError|image_hydrate_failed|image_fetch_failed|代拉 TokenMix|创建任务超时|任务查询超时|TokenMix 创建任务超时|TokenMix 任务查询超时/i.test(
    msg,
  )
}

/** start 单次请求限时，避免卡在「创建任务中」直到 nginx 300s */
async function withRequestTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  parent: AbortSignal | undefined,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const ac = new AbortController()
  const onParent = () => ac.abort()
  parent?.addEventListener('abort', onParent)
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    return await work(ac.signal)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (parent?.aborted) throw e
    if (/abort/i.test(msg)) throw new Error(`${label}超时（${Math.round(timeoutMs / 1000)}秒），请重试`)
    throw e instanceof Error ? e : new Error(msg)
  } finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', onParent)
  }
}

async function postAgentImageJson(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const [auth, tenantId] = await Promise.all([
    resolveMerchantApiBearer(),
    (async () => {
      if (!supabaseConfigured || !supabase) return undefined
      return (await fetchPrimaryTenantId(supabase)) ?? undefined
    })(),
  ])
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...merchantApiAuthHeaders(auth.token, auth.source),
  }
  const payload = { ...body, ...(tenantId ? { tenantId } : {}) }
  const urls = merchantErpApiCandidates('/api/meoo-ai-agent-image')
  let lastErr = 'no_response'
  for (const url of urls) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal,
      })
      const text = await res.text()
      let json: Record<string, unknown> = {}
      try {
        json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
      } catch {
        json = {}
      }
      if (res.ok && json.ok === true) return json
      const detail =
        typeof json.detail === 'string'
          ? json.detail
          : typeof json.message === 'string'
            ? json.message
            : typeof json.error === 'string'
              ? json.error
              : text.slice(0, 200)
      lastErr = detail || `HTTP ${res.status}`
      if (res.status === 404) continue
      throw new Error(lastErr)
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (signal?.aborted || /AbortError/i.test(lastErr)) throw e
      if (isFetchNetworkError(lastErr)) continue
      throw e instanceof Error ? e : new Error(lastErr)
    }
  }
  throw new Error(lastErr || 'ai_agent_image_unavailable')
}

/**
 * 高级 GPT Image：start 创建任务 + 短轮询直到出图。
 * 网络抖动自动重试 start/poll，绝不回退万相。
 */
export async function generateVisualStudioGptImage(opts: {
  prompt: string
  wanxSize?: string
  signal?: AbortSignal
  onProgress?: (msg: string) => void
}): Promise<VisualStudioGptImageResult> {
  const model = VISUAL_STUDIO_PRO_IMAGE_MODEL
  const deadline = Date.now() + 300_000
  let taskId = ''
  let displayModel = model
  let startAttempts = 0

  while (!taskId && Date.now() < deadline) {
    if (opts.signal?.aborted) return { ok: false, message: '已取消' }
    startAttempts += 1
    opts.onProgress?.(
      startAttempts === 1
        ? 'GPT Image 2 创建任务中…'
        : `GPT Image 2 创建任务重试（第 ${startAttempts} 次）…`,
    )
    try {
      const started = await withRequestTimeout(
        (signal) =>
          postAgentImageJson(
            {
              phase: 'start',
              prompt: opts.prompt,
              image_route: 'tokenmix',
              tokenmix_image_model: model,
              exact_prompt: true,
              ...(opts.wanxSize ? { wanx_size: opts.wanxSize } : {}),
            },
            signal,
          ),
        opts.signal,
        55_000,
        'GPT Image 创建任务',
      )
      if (typeof started.imageUrl === 'string' && started.imageUrl.trim()) {
        return {
          ok: true,
          imageUrl: started.imageUrl.trim(),
          channel: 'tokenmix',
          displayModel:
            typeof started.displayModel === 'string' ? started.displayModel : model,
        }
      }
      if (started.pending === true && typeof started.taskId === 'string' && started.taskId.trim()) {
        taskId = started.taskId.trim()
        if (typeof started.displayModel === 'string' && started.displayModel.trim()) {
          displayModel = started.displayModel.trim()
        }
        break
      }
      throw new Error('高级生图未返回 taskId')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (opts.signal?.aborted || /已取消/i.test(msg)) {
        return { ok: false, message: '已取消' }
      }
      if (isFetchNetworkError(msg) && startAttempts < 8 && Date.now() < deadline) {
        await sleepMs(Math.min(4000, 800 * startAttempts))
        continue
      }
      return { ok: false, message: msg.slice(0, 240) }
    }
  }

  if (!taskId) return { ok: false, message: 'GPT Image 创建任务失败，请重试' }

  let pollRound = 0
  let waitSec = 3
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) return { ok: false, message: '已取消' }
    await sleepMs(Math.max(1000, Math.min(10_000, waitSec * 1000)))
    pollRound += 1
    opts.onProgress?.(`GPT Image 2 生成中…（轮询 ${pollRound}）`)
    try {
      const polled = await postAgentImageJson(
        {
          phase: 'poll',
          task_id: taskId,
          image_route: 'tokenmix',
          tokenmix_image_model: model,
        },
        opts.signal,
      )
      if (typeof polled.imageUrl === 'string' && polled.imageUrl.trim()) {
        return {
          ok: true,
          imageUrl: polled.imageUrl.trim(),
          channel: 'tokenmix',
          displayModel:
            typeof polled.displayModel === 'string' ? polled.displayModel : displayModel,
        }
      }
      if (polled.pending === true) {
        const ra = Number(polled.retryAfterSec)
        if (Number.isFinite(ra) && ra > 0) waitSec = Math.max(1, Math.min(10, Math.round(ra)))
        continue
      }
      throw new Error(
        typeof polled.detail === 'string'
          ? polled.detail
          : '高级生图轮询无结果',
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (opts.signal?.aborted || /已取消|AbortError/i.test(msg)) {
        return { ok: false, message: '已取消' }
      }
      // 轮询网络失败：继续同一 taskId，不换万相
      if (isFetchNetworkError(msg) && Date.now() < deadline) {
        waitSec = Math.min(8, waitSec + 1)
        continue
      }
      return { ok: false, message: msg.slice(0, 240) }
    }
  }
  return { ok: false, message: 'GPT Image 生成超时（5 分钟），请重试高级生图' }
}
