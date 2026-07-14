/**
 * 视觉工坊 AI 接入：文案（LLM）+ 生图 Prompt 打包（LLM）+ 生图（postAiAgentNativeImage）
 */
import { postAiChat } from './aiClient'
import type { CopySuggestion, PublishChannelId, VisualStudioForm } from '../../lib/aiImageStudioPresets'
import {
  buildVisualStudioImageContext,
  buildVisualStudioPrompt,
  generateCopySuggestions,
  PUBLISH_CHANNELS,
  resolveIndustrySceneContext,
  resolvePlaybook,
  resolvePlaybookVariant,
} from '../../lib/aiImageStudioPresets'

function stripJsonFence(raw: string): string {
  const t = raw.trim()
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  return (m?.[1] ?? t).trim()
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

  try {
    const res = await postAiChat(
      {
        provider: 'qwen',
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
      { signal: opts?.signal },
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
    return {
      ok: false,
      message: msg.includes('abort') ? '已取消' : `AI 文案暂不可用：${msg.slice(0, 120)}`,
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
    refineNote?: string
    signal?: AbortSignal
  },
): Promise<VisualStudioImagePromptResult> {
  const fallback = buildVisualStudioPrompt(form, opts)
  const ctx = buildVisualStudioImageContext(form, opts)
  const ctxJson = JSON.stringify(ctx, null, 2)

  const userPrompt = [
    '你是中国大陆本地生活营销海报的「生图 Prompt 工程师」。请根据下列 JSON 业务上下文，输出一段可直接交给文生图模型的中文 Prompt。',
    '',
    '要求：',
    '1. 单段连贯描述，300～600 字，不要 JSON、不要 markdown、不要编号列表',
    '2. 必须锁定业态与场景：画面主体/环境/道具与 industry、industrySceneHint 一致，严禁业态错配（足浴/足疗须为足浴沙发/足疗椅场景，禁止浴缸/酒店客房/海边度假；餐饮禁止足疗场景）',
    '3. 必须体现 headline、offer、subheadline 等文案为画面中的中文大字信息',
    '4. 体现 styleHint、compositionVariant、渠道尺寸与 playbook 玩法',
    '5. 若有 productRefCount>0 或 styleFromReference，强调与参考图品类色调一致',
    '6. 结尾注明：专业海报排版、中文清晰可读、无水印乱码',
    '',
    '业务上下文 JSON：',
    ctxJson,
  ].join('\n')

  try {
    const res = await postAiChat(
      {
        provider: 'qwen',
        messages: [
          {
            role: 'system',
            content:
              '你只输出一段中文文生图 Prompt 正文，禁止任何解释、前缀后缀、代码块。Prompt 须让模型生成与业态严格匹配的营销海报。',
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
