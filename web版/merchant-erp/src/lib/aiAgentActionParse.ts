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
  if (
    /创建|商品|套餐|上架|双人|单人|三人|四人|火锅|团购|代金券|代\s*\d+|抵\s*\d+|券面|上传.*(商品|套餐|券)/.test(
      x,
    )
  ) {
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
  { pattern: /双人套餐|双人餐|二人餐|2\s*人餐/, label: '双人套餐' },
  { pattern: /三人套餐|三人餐|3\s*人餐/, label: '三人套餐' },
  { pattern: /单人套餐|单人餐|一人餐|1\s*人餐/, label: '单人套餐' },
  { pattern: /四人套餐|四人餐|4\s*人餐/, label: '四人套餐' },
  { pattern: /五人套餐|五人餐|5\s*人餐/, label: '五人套餐' },
  { pattern: /家庭套餐|家庭餐|亲子餐/, label: '家庭套餐' },
]

const MEAL_INTENT_ORDER = [
  '单人套餐',
  '双人套餐',
  '三人套餐',
  '四人套餐',
  '五人套餐',
  '家庭套餐',
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
  if (voucherMatch || /(?:一张|一个|一款)?\s*代金券|代\s*\d+\s*抵/.test(x)) {
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

  const mealIntents = intents.filter((i) => i.productType === 1)
  const voucherIntents = intents.filter((i) => i.productType === 2)
  mealIntents.sort(
    (a, b) =>
      (MEAL_INTENT_ORDER.indexOf(a.label) === -1 ? 99 : MEAL_INTENT_ORDER.indexOf(a.label)) -
      (MEAL_INTENT_ORDER.indexOf(b.label) === -1 ? 99 : MEAL_INTENT_ORDER.indexOf(b.label)),
  )
  return [...mealIntents, ...voucherIntents].slice(0, 6)
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
  if (t) {
    if (t.startsWith('{') && t.includes('"code"')) {
      try {
        const o = JSON.parse(t) as Record<string, unknown>
        if (o.code === 500 || o.code === '500') {
          return '服务端函数异常（HTTP 500），请查看 Vercel 部署日志'
        }
        const msg = coerceAgentTextField(o.message ?? o.detail ?? o.error, 600)
        if (msg) return msg
      } catch {
        /* keep t */
      }
    }
    return t
  }
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

/** 去除助手回复中的 Markdown 装饰符（#、* 等），便于对话区整洁展示 */
export function formatAssistantDisplayText(content: string): string {
  if (!content?.trim()) return content
  let s = content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
  s = s.replace(/^#{1,6}\s+/gm, '')
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
  s = s.replace(/^-{3,}\s*$/gm, '')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

/** 用户是否在请求方案/规划类设计（先出方案，再确认执行） */
export function isPlanDesignQuery(text: string): boolean {
  const x = text.replace(/\[引用[\s\S]*?\n\n/, '').trim()
  if (/确认执行|开始创建|立即上架|按方案执行/.test(x)) return false
  return /规划|方案设计|活动安排|套餐搭配|组品|618|达人合作|营销策略|推广计划|帮我规划|帮我设计/.test(x)
}

/** 用户是否明确同意按方案执行 */
export function isExplicitExecutionIntent(text: string): boolean {
  const x = text.replace(/\[引用[\s\S]*?\n\n/, '').trim()
  return /确认执行|按.*方案执行|开始创建|立即上架|需要执行|同意执行|执行方案|确认创建|帮我执行|按上述方案/.test(x)
}

/** 用户表示无商品图、请 AI 生成 */
export function isUserDecliningProductImages(text: string): boolean {
  const x = text.replace(/\[引用[\s\S]*?\n\n/, '').trim()
  return /没有图|无图|不用图|自动生成|AI生成|帮我生成图|没.*图片|无需上传|不用上传/.test(x)
}

/** 助手回复是否像完整方案文档（非结构化 JSON action） */
export function looksLikePlanDocument(content: string): boolean {
  const c = content.slice(0, 5000)
  if (parseAgentActionType(content)) return false
  if (c.length < 120) return false
  if (/活动安排|套餐搭配|组品|达人合作|推广策略|商品套餐|618|内容营销/.test(c)) return true
  if (/套餐[一二三四五六1-6]/.test(c) && /方案|规划|搭配|组品/.test(c)) return true
  if (/^#{1,4}\s/m.test(c) && c.length > 200) return true
  return false
}

/** 从用户话术 + 助手方案推断需执行的任务类型 */
export function inferTaskTypesFromCombinedContext(
  userText: string,
  assistantContent?: string,
): AiTaskType[] {
  const types = new Set<AiTaskType>()
  const userType = inferTaskTypeFromText(userText)
  if (userType) types.add(userType)
  if (assistantContent) {
    const c = assistantContent
    if (/商品|套餐|组品|团购|上架|代金券|组品方案/.test(c)) types.add('create_product')
    if (/达人|招募|探店|种草|KOL|网红|达人合作/.test(c)) types.add('recruit_influencer')
  }
  return [...types]
}

/** 方案设计完成后追加的执行确认引导语 */
export function buildPlanExecutionConsultation(taskTypes: AiTaskType[]): string {
  const parts: string[] = []
  if (taskTypes.includes('create_product')) parts.push('商品/套餐创建')
  if (taskTypes.includes('recruit_influencer')) parts.push('达人招募')
  if (!parts.length) return ''
  return `\n\n——\n\n若需要我按上述方案执行${parts.join('与')}，请回复「确认执行」。\n如有商品图可在下一条消息上传，我将优化为主图与辅助图；若无图片，我会根据方案自动生成。\n您也可以直接说明需要调整的部分。`
}

const PLAN_SLOT_PATTERNS: RegExp[] = [
  /套餐[一二三四五六1-6][：:\s、]*([^\n#*]{2,48})/g,
  /组品[方案\s]*[一二三四五六1-6][：:\s、]*([^\n#*]{2,48})/g,
  /(?:^|\n)\s*(?:\d+[.、]|[-•])\s*([^\n：:]{2,36}(?:套装|组合|套餐|方案))/gm,
]

function planIntentBrief(full: string, focus: string): string {
  return `${full}\n\n【仅生成以下一项】${focus}。不要与其它餐型或代金券合并；须输出完整团购标题、售价、套餐项与说明。`
}

/** 结合助手方案中的套餐/组品条目拆出多个上架意图 */
export function parseCreateProductIntentsFromPlan(
  userBrief: string,
  assistantContent?: string,
): CreateProductIntent[] {
  const fromUser = parseCreateProductIntents(userBrief)
  if (!assistantContent?.trim()) return fromUser

  const full = `${stripQuoteBlock(userBrief)}\n${assistantContent}`
  const slots: CreateProductIntent[] = []
  const seen = new Set<string>()

  for (const re of PLAN_SLOT_PATTERNS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(full)) !== null) {
      const label = m[1].replace(/\*\*/g, '').trim().slice(0, 48)
      if (label.length < 2 || seen.has(label)) continue
      seen.add(label)
      slots.push({
        key: label,
        label,
        brief: planIntentBrief(full, `团购套餐「${label}」`),
        productType: 1,
      })
    }
  }

  if (slots.length > 0) return slots.slice(0, 6)
  if (fromUser.length > 1 || (fromUser.length === 1 && fromUser[0].key !== 'main')) return fromUser

  const countM = assistantContent.match(/(\d+)\s*个(?:组品|套餐|商品|方案)/)
  if (countM) {
    const n = Math.min(6, Math.max(2, Number.parseInt(countM[1], 10) || 0))
    if (n > 1) {
      return Array.from({ length: n }, (_, i) => ({
        key: `plan-${i + 1}`,
        label: `方案 ${i + 1}`,
        brief: planIntentBrief(full, `第 ${i + 1} 个团购方案（共 ${n} 个，须相互区分售价与内容）`),
        productType: 1,
      }))
    }
  }
  return fromUser
}

/** 是否应推迟自动预览（等用户确认后再生成执行预览） */
export function shouldDeferTaskPreview(
  userText: string,
  assistantContent?: string,
  explicitTaskType?: AiTaskType,
): boolean {
  if (parseAgentActionType(assistantContent ?? '')) return false
  if (isExplicitExecutionIntent(userText)) return false
  if (explicitTaskType && !isPlanDesignQuery(userText)) return false
  if (isPlanDesignQuery(userText)) return true
  if (assistantContent && looksLikePlanDocument(assistantContent)) return true
  return false
}
