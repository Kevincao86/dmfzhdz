import type { AiTaskType } from './aiAgentTypes'
import { inferDouyinProductTypeFromText } from './aiAgentProductPreviewDefaults'

const ACTION_TO_TASK: Record<string, AiTaskType> = {
  create_product: 'create_product',
  recruit_influencer: 'recruit_influencer',
  handle_review: 'handle_review',
  sync_platform: 'sync_platform',
  analyze_exception: 'analyze_exception',
  generate_copywriting: 'generate_copywriting',
  file_tax: 'file_tax',
}

/** 从用户话术推断任务类型（与 scheduleTaskPreview 共用） */
export function inferTaskTypeFromText(t: string): AiTaskType | undefined {
  const x = t.replace(/\[引用[\s\S]*?\n\n/, '').trim()
  if (/创建|商品|套餐|上架|双人|单人|火锅|团购|代金券|代\s*\d+|抵\s*\d+|券面|上传.*(商品|套餐|券)/.test(x)) {
    return 'create_product'
  }
  if (/达人|招募|探店|brief|Brief|种草|探店笔记/.test(x)) return 'recruit_influencer'
  if (/差评|评价|评论/.test(x)) return 'handle_review'
  if (/分析|原因|异常/.test(x)) return 'analyze_exception'
  if (/同步|失败/.test(x)) return 'sync_platform'
  if (/报税|税务|申报|增值税|一键报税|纳税/.test(x)) return 'file_tax'
  return undefined
}

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  const t = raw.trim()
  const candidates: string[] = []
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) candidates.push(fence[1].trim())
  const brace = t.match(/\{[\s\S]*\}/)
  if (brace?.[0]) candidates.push(brace[0])
  candidates.push(t)
  for (const s of candidates) {
    try {
      const j = JSON.parse(s) as unknown
      if (j && typeof j === 'object' && !Array.isArray(j)) return j as Record<string, unknown>
    } catch {
      /* next */
    }
  }
  return null
}

/** 从助手回复中的 JSON 预览块解析 actionType */
export function parseAgentActionType(content: string): AiTaskType | undefined {
  const j = tryParseJsonObject(content)
  if (!j) return undefined
  const at = String(j.actionType ?? j.action_type ?? '').trim()
  return ACTION_TO_TASK[at]
}

export function parseAgentPreviewTitle(content: string): string | undefined {
  const j = tryParseJsonObject(content)
  if (!j) return undefined
  const title = j.title
  return typeof title === 'string' && title.trim() ? title.trim() : undefined
}

/** 助手返回结构化预览 JSON 时，用简短中文替代整段 JSON 展示 */
export function summarizeAssistantContent(content: string): string | null {
  const taskType = parseAgentActionType(content)
  if (!taskType) return null
  const title = parseAgentPreviewTitle(content)
  switch (taskType) {
    case 'create_product':
      return title || '已理解您的上架需求，请在下方核对抖音 C 端手机预览并确认。'
    case 'recruit_influencer':
      return title || '已理解您的达人招募需求，请在下方查看图文 Brief 并确认。'
    case 'file_tax':
      return title || '已理解您的报税需求，请在下方核对各平台汇总后确认一键报税。'
    default:
      return title || '请在下方确认执行预览后继续。'
  }
}

/** 从用户描述提取商品名/标题草稿 */
export function briefProductNameHint(text: string): string {
  const x = text.replace(/\[引用[\s\S]*?\n\n/, '').trim()
  const voucher = x.match(/\d+\s*代\s*\d+[^，。.\n]{0,12}?(?:代金券|券)?/)
  if (voucher?.[0]) return voucher[0].replace(/\s+/g, '')
  const m = x.match(/(?:上传|创建|上架)(?:一个|一款)?(.{2,40}?)(?:商品|套餐|券|$)/)
  if (m?.[1]) return m[1].trim().slice(0, 48)
  return x.slice(0, 48) || '商品方案'
}

export function inferVoucherPricesFromText(text: string): { price?: number; origin?: number } {
  const m = text.match(/(\d+)\s*代\s*(\d+)/)
  if (!m) return {}
  const price = Number(m[1])
  const origin = Number(m[2])
  if (!Number.isFinite(price) || !Number.isFinite(origin)) return {}
  return { price, origin }
}

export type CreateProductIntent = {
  key: string
  label: string
  brief: string
  productType: number
}

const MEAL_INTENT_RULES: { pattern: RegExp; label: string }[] = [
  { pattern: /双人餐|二人餐|2\s*人餐/, label: '双人餐' },
  { pattern: /三人餐|3\s*人餐/, label: '三人餐' },
  { pattern: /单人餐|一人餐|1\s*人餐/, label: '单人餐' },
  { pattern: /四人餐|4\s*人餐/, label: '四人餐' },
  { pattern: /五人餐|5\s*人餐/, label: '五人餐' },
  { pattern: /家庭餐|亲子餐/, label: '家庭餐' },
]

function stripQuoteBlock(text: string): string {
  return text.replace(/\[引用[\s\S]*?\n\n/, '').trim()
}

function intentBrief(full: string, focus: string): string {
  return `${full}\n\n【仅生成以下一项】${focus}。不要与其它餐型或代金券合并；须输出完整团购标题、售价、套餐项与说明。`
}

/** 从用户话术拆出多个上架意图（如单人/双人/三人餐 + 代金券） */
export function parseCreateProductIntents(text: string): CreateProductIntent[] {
  const x = stripQuoteBlock(text)
  if (!x) {
    return [{ key: 'main', label: '商品方案', brief: text, productType: 1 }]
  }

  const intents: CreateProductIntent[] = []
  const seen = new Set<string>()

  for (const rule of MEAL_INTENT_RULES) {
    if (!rule.pattern.test(x)) continue
    if (seen.has(rule.label)) continue
    seen.add(rule.label)
    intents.push({
      key: rule.label,
      label: rule.label,
      brief: intentBrief(x, `团购套餐「${rule.label}」`),
      productType: 1,
    })
  }

  const voucherMatch = x.match(/(\d+)\s*代\s*(\d+)[^，。.\n]{0,24}?(?:元代金券|代金券|券)?/)
  if (voucherMatch || /代金券|代\s*\d+\s*抵/.test(x)) {
    const label = voucherMatch?.[0]?.replace(/\s+/g, '') ?? '代金券'
    if (!seen.has(label)) {
      seen.add(label)
      intents.push({
        key: `voucher-${label}`,
        label,
        brief: intentBrief(x, `代金券「${label}」`),
        productType: 2,
      })
    }
  }

  const countMatch = x.match(/(\d+)\s*个(?:商品)?(?:套餐|团购)/)
  if (!intents.length && countMatch) {
    const n = Math.min(6, Math.max(1, Number.parseInt(countMatch[1], 10) || 1))
    for (let i = 1; i <= n; i++) {
      const label = `套餐方案 ${i}`
      intents.push({
        key: `combo-${i}`,
        label,
        brief: intentBrief(x, `第 ${i} 个团购套餐（共 ${n} 个，须相互区分售价与内容）`),
        productType: 1,
      })
    }
  }

  if (!intents.length) {
    const hint = briefProductNameHint(x)
    intents.push({
      key: 'main',
      label: hint,
      brief: x,
      productType: inferDouyinProductTypeFromText(x) === 2 ? 2 : 1,
    })
  }

  return intents.slice(0, 6)
}

/** 将 API/LLM 杂项字段安全转为展示用字符串 */
export function coerceAgentTextField(value: unknown, maxLen = 400): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') {
    const s = value.trim()
    return s ? s.slice(0, maxLen) : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'object') {
    try {
      const s = JSON.stringify(value)
      return s.length > 2 ? s.slice(0, maxLen) : undefined
    } catch {
      return undefined
    }
  }
  return String(value).slice(0, maxLen)
}

/** 错误提示展示（避免 [object Object]） */
export function coerceAgentDisplayError(value: unknown, fallback = '未知错误'): string {
  const t = coerceAgentTextField(value, 600)
  if (t) return t
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    for (const k of ['message', 'detail', 'error', 'msg', 'reason']) {
      const nested = coerceAgentTextField(o[k], 600)
      if (nested) return nested
    }
  }
  if (value == null) return fallback
  return fallback
}

export function parseComboLinesFromApi(raw: unknown): string[] {
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

export function parsePriceYuanFromApi(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw
  if (typeof raw === 'string') {
    const n = Number.parseFloat(raw.replace(/[^\d.]/g, ''))
    if (Number.isFinite(n) && n > 0) return n
  }
  return undefined
}
