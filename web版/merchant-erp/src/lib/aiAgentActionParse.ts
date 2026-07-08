import type { AiTaskType } from './aiAgentTypes'
import {
  isAgentShortcutTaskLine,
  isInformationalOnlyQuery,
  isPlanOrNineScenarioQuery,
} from './aiAgentSystemPromptRoute'
import { resolveAssistantVisibleText } from './assistantThinkingText'
import { filterScenarioTaskTypes } from './aiAgentPreviewState'
import { buildClosedLoopSystemAddon, getScenarioWorkflow } from './aiAgentScenarioWorkflows'
import { inferDouyinProductTypeFromText } from './aiAgentProductPreviewDefaults'
import { buildMenuComboIntentLabels } from './merchantBriefCatalog'
import { detectImageGenerationIntent } from '../services/ai/aiImageIntentRouting'

const ACTION_TO_TASK: Record<string, AiTaskType> = {
  create_product: 'create_product',
  create_product_batch: 'create_product',
  recruit_influencer: 'recruit_influencer',
  create_recruitment: 'recruit_influencer',
  recruit_talents: 'recruit_influencer',
  handle_review: 'handle_review',
  sync_platform: 'sync_platform',
  analyze_exception: 'analyze_exception',
  generate_copywriting: 'generate_copywriting',
  optimize_local_ads: 'optimize_local_ads',
  follow_local_lead: 'follow_local_lead',
  file_tax: 'file_tax',
}

function mapActionTypeToTask(raw: string): AiTaskType | undefined {
  const at = String(raw ?? '').trim()
  return at ? ACTION_TO_TASK[at] : undefined
}

/** 行业/趋势类讨论（含「达人」但非发起招募执行） */
export function isInformationalKolDiscussion(t: string): boolean {
  const x = t.replace(/\[引用[\s\S]*?\n\n/, '').trim()
  if (
    /招募|探店|种草|brief|Brief|达人招募|找达人|安排达人|帮我招|招达人|探店计划|达人合作方案|达人矩阵|达人预算/.test(
      x,
    )
  ) {
    return false
  }
  return (
    /达人/.test(x) &&
    /数量|增长|趋势|规模|市场|行情|预测|全国|未来|多少|占比|统计|会增加|将增加|展望|研究报告|行业|生态|经济/.test(
      x,
    )
  )
}

/** 用户是否在请求达人招募/探店（非泛泛提到「达人」） */
export function isRecruitInfluencerUserIntent(t: string): boolean {
  const x = t.replace(/\[引用[\s\S]*?\n\n/, '').trim()
  if (isInformationalKolDiscussion(x)) return false
  return /招募|探店|种草|brief|Brief|探店笔记|达人招募|找达人|网红招募|达人合作|达人方案|达人预算|安排达人|帮我招|招达人|探店计划|达人矩阵/.test(
    x,
  )
}

/** 从用户话术推断任务类型（与 scheduleTaskPreview 共用） */
export function inferTaskTypeFromText(t: string): AiTaskType | undefined {
  const x = t.replace(/\[引用[\s\S]*?\n\n/, '').trim()
  // 文生图/主图/海报等像素出图，勿误判为创建团购商品（否则会拉 GEO/竞品，分钟级卡住）
  if (detectImageGenerationIntent(x)) return undefined
  if (isInformationalOnlyQuery(x)) return undefined
  if (
    /创建|上架|组品|上传.*(商品|套餐|券)|发布.*(?:商品|套餐|团购)|帮我.*(?:上架|创建|组品)|做(?:一|个).*(?:商品|套餐|团购)/.test(
      x,
    ) ||
    (/团购|套餐|代金券|双人|单人|三人|四人|火锅|代\s*\d+|抵\s*\d+|券面|商品/.test(x) &&
      /帮我|我要|需要|请|想要|打算|准备|立即|马上/.test(x))
  ) {
    return 'create_product'
  }
  if (isRecruitInfluencerUserIntent(x)) return 'recruit_influencer'
  if (/差评|评价|评论|回复.*评/.test(x)) return 'handle_review'
  if (/分析|原因|异常|掉单|核销.*少|ROI.*下/.test(x)) return 'analyze_exception'
  if (/同步|多端.*不一致|平台.*差异/.test(x)) return 'sync_platform'
  if (/报税|税务|申报|增值税|一键报税|纳税/.test(x)) return 'file_tax'
  if (/文案|口播|推广语|话题标签|种草文案|写.*标题/.test(x) && !isInformationalOnlyQuery(x)) {
    return 'generate_copywriting'
  }
  if (/本地推|投流|CPA|出价|素材.*优化/.test(x)) return 'optimize_local_ads'
  if (/线索|留资|跟进|预约到店|待跟进/.test(x)) return 'follow_local_lead'
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
  return mapActionTypeToTask(at)
}

/** 扫描全文多个 JSON 块中的 actionType（组合方案常含多段预览 JSON） */
export function collectAgentActionTypes(content: string): AiTaskType[] {
  const found = new Set<AiTaskType>()
  const c = content || ''
  for (const re of [/\"actionType\"\s*:\s*\"([^\"]+)\"/gi, /\"action_type\"\s*:\s*\"([^\"]+)\"/gi]) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(c)) !== null) {
      const t = mapActionTypeToTask(m[1] ?? '')
      if (t) found.add(t)
    }
  }
  const single = parseAgentActionType(c)
  if (single) found.add(single)
  return [...found]
}

/** 助手 JSON 是否要求用户先确认方案再进入执行预览 */
export function parseAgentConfirmRequired(content: string): boolean {
  const j = tryParseJsonObject(content)
  if (!j) return false
  return j.confirmRequired === true || j.confirm_required === true
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
  let s = resolveAssistantVisibleText(content)
  s = s.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
  s = s.replace(/^#{1,6}\s+/gm, '')
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
  s = s.replace(/^-{3,}\s*$/gm, '')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

export {
  isAgentShortcutTaskLine,
  isInformationalOnlyQuery,
  isPlanDesignQuery,
  isPlanOrNineScenarioQuery,
  shouldUseFullAgentSystemPrompt,
} from './aiAgentSystemPromptRoute'

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

/** 用户是否通过「快捷任务」入口发起（九大场景之一） */
/** 从用户话术 + 助手方案推断需执行的任务类型（允许多场景并存，不因助手寒暄误识别） */
export function inferTaskTypesFromCombinedContext(
  userText: string,
  assistantContent?: string,
  explicitTaskType?: AiTaskType,
): AiTaskType[] {
  const types = new Set<AiTaskType>()
  const planIntent = isPlanOrNineScenarioQuery(userText) && !isInformationalOnlyQuery(userText)

  if (assistantContent && planIntent) {
    for (const t of collectAgentActionTypes(assistantContent)) types.add(t)
    const c = assistantContent
    if (/商品|套餐|组品|团购|上架|代金券|组品方案/.test(c)) types.add('create_product')
    if (/招募|探店|种草|达人招募|达人合作|Brief|brief|create_recruitment|探店计划|达人矩阵|达人预算/.test(c))
      types.add('recruit_influencer')
    if (/文案|口播|话题|推广语|种草文案/.test(c)) types.add('generate_copywriting')
    if (/本地推|投流|CPA|出价优化/.test(c)) types.add('optimize_local_ads')
    if (/线索|留资|跟进|预约/.test(c)) types.add('follow_local_lead')
    if (/差评|评价|评论/.test(c)) types.add('handle_review')
    if (/同步|不一致|差异/.test(c)) types.add('sync_platform')
    if (/异常|掉单|驳回|失败/.test(c)) types.add('analyze_exception')
    if (/报税|税务|申报/.test(c)) types.add('file_tax')
  }

  if (explicitTaskType && (isAgentShortcutTaskLine(userText) || planIntent)) {
    types.add(explicitTaskType)
  }

  const userType = inferTaskTypeFromText(userText)
  if (userType) types.add(userType)

  return filterScenarioTaskTypes([...types])
}

/** 方案是否包含达人招募（taskTypes 或正文关键词） */
export function planIncludesRecruitInfluencer(plan: {
  taskTypes: AiTaskType[]
  assistantContent: string
}): boolean {
  if (plan.taskTypes.includes('recruit_influencer')) return true
  const c = plan.assistantContent
  return /招募|探店|种草|达人招募|达人合作|Brief|brief|create_recruitment|探店计划|达人矩阵|达人预算/.test(c)
}

/** 是否应自动弹出达人招募执行预览（须用户场景/执行意图或方案内结构化 JSON） */
export function shouldAutoRecruitInfluencerPreview(
  userText: string,
  assistantContent?: string,
): boolean {
  if (isAgentShortcutTaskLine(userText)) return true
  if (isRecruitInfluencerUserIntent(userText)) return true
  if (isExplicitExecutionIntent(userText)) return true
  if (!assistantContent?.trim()) return false
  if (parseAgentActionType(assistantContent) !== 'recruit_influencer') return false
  return isPlanOrNineScenarioQuery(userText) || isExplicitExecutionIntent(userText)
}

/** 推断是否应自动生成任务预览（避免闲聊误触发） */
export function resolveAutoTaskPreviewType(
  userText: string,
  assistantContent?: string,
  explicitTaskType?: AiTaskType,
): AiTaskType | undefined {
  if (isInformationalOnlyQuery(userText)) return undefined
  if (!isAgentShortcutTaskLine(userText) && !isExplicitExecutionIntent(userText)) return undefined
  if (explicitTaskType) return explicitTaskType
  const fromJson = assistantContent ? parseAgentActionType(assistantContent) : undefined
  if (fromJson === 'recruit_influencer' && !shouldAutoRecruitInfluencerPreview(userText, assistantContent)) {
    return undefined
  }
  if (fromJson) return fromJson
  const fromUser = inferTaskTypeFromText(userText)
  if (fromUser === 'recruit_influencer' && !shouldAutoRecruitInfluencerPreview(userText, assistantContent)) {
    return undefined
  }
  return fromUser
}

function scenarioLabelWithPhase(taskType: AiTaskType): string {
  const def = getScenarioWorkflow(taskType)
  if (!def) return taskType
  return `${def.label}（${def.phase} ${def.phaseLabel}）`
}

/** 方案设计完成后追加的执行确认引导语（按实际涉及场景生成，避免误提无关任务） */
export function buildPlanExecutionConsultation(taskTypes: AiTaskType[]): string {
  const filtered = filterScenarioTaskTypes(taskTypes)
  if (!filtered.length) return ''

  const adjustHint = '您也可以直接说明需要调整的部分。'
  const productNote = filtered.includes('create_product')
    ? '\n如有商品图可在下一条消息上传；若无图片，回复「自动生成」即可。'
    : ''

  if (filtered.length === 1) {
    const taskType = filtered[0]!
    const only = scenarioLabelWithPhase(taskType)
    const def = getScenarioWorkflow(taskType)
    const stepHint =
      def && def.workflowSteps.length > 0
        ? `\n确认后将按 ${def.workflowSteps.length} 步标准工作流生成执行预览。`
        : ''
    return `\n\n——\n\n若需要我按上述方案执行「${only}」，请回复「确认执行」。${stepHint}${productNote}\n${adjustHint}`
  }

  const list = filtered.map(scenarioLabelWithPhase).join('、')
  const loopAddon = buildClosedLoopSystemAddon(filtered)
  const loopHint = loopAddon
    ? `\n${loopAddon.replace(/^【多场景闭环】\n/, '【闭环说明】\n')}`
    : ''
  return `\n\n——\n\n若需要我按上述方案执行，请回复「确认执行」。\n将为 ${filtered.length} 项场景（${list}）分别生成独立预览卡片，您可在各卡片内单独确认、修改或取消；确认后我将调用对应接口并返回结果。${loopHint}${productNote}\n${adjustHint}`
}

const PLAN_SECTION_HEADER_RE =
  /(?:^|\n)\s*(?:\d+[.、]\s*)?(?:#{1,4}\s*)?(主套餐|次套餐|赠品(?:策略|方案)?)\s*[：:]\s*([^\n]*)/gim

function normalizePlanSectionKind(raw: string): 'main' | 'sub' | 'gift' | null {
  if (/主套餐/.test(raw)) return 'main'
  if (/次套餐/.test(raw)) return 'sub'
  if (/赠品/.test(raw)) return 'gift'
  return null
}

const PLAN_SECTION_LABEL: Record<'main' | 'sub' | 'gift', string> = {
  main: '主套餐',
  sub: '次套餐',
  gift: '赠品策略',
}

/** 从方案 Markdown 解析「主套餐 / 次套餐 / 赠品策略」等结构化组品（避免误拆成 5 个预览） */
function parsePlanMarkdownProductSections(
  userBrief: string,
  assistantContent: string,
): CreateProductIntent[] | null {
  const full = `${stripQuoteBlock(userBrief)}\n${assistantContent}`
  const headers: {
    index: number
    end: number
    kind: 'main' | 'sub' | 'gift'
    titleHint: string
  }[] = []

  PLAN_SECTION_HEADER_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PLAN_SECTION_HEADER_RE.exec(full)) !== null) {
    const kind = normalizePlanSectionKind(m[1])
    if (!kind) continue
    headers.push({
      index: m.index,
      end: m.index + m[0].length,
      kind,
      titleHint: m[2].replace(/\*\*/g, '').trim(),
    })
  }

  if (headers.length === 0) return null
  const hasCombo = headers.some((h) => h.kind === 'main' || h.kind === 'sub')
  if (!hasCombo) return null

  const seenKinds = new Set<string>()
  const uniqueHeaders = headers.filter((h) => {
    if (seenKinds.has(h.kind)) return false
    seenKinds.add(h.kind)
    return true
  })

  const intents: CreateProductIntent[] = []
  for (let i = 0; i < uniqueHeaders.length; i++) {
    const h = uniqueHeaders[i]!
    const nextStart = uniqueHeaders[i + 1]?.index ?? full.length
    const body = full.slice(h.end, nextStart).trim()
    let name = h.titleHint
    if (!name || name.length < 2) {
      const nameM = body.match(/(?:套餐名称|组合名称|名称)\s*[：:]\s*([^\n*]{2,48})/)
      if (nameM?.[1]) name = nameM[1].replace(/\*\*/g, '').trim()
    }
    const sectionLabel = PLAN_SECTION_LABEL[h.kind]
    const label =
      name && name !== sectionLabel
        ? `${sectionLabel} · ${name.replace(/^[：:\s]+/, '').slice(0, 36)}`
        : sectionLabel
    const priceYuan = parsePriceYuanFromText(body) ?? parsePriceYuanFromText(h.titleHint)
    const focusKind = h.kind === 'gift' ? '赠品/加赠策略' : '团购套餐'
    intents.push({
      key: h.kind,
      label: label.slice(0, 48),
      brief: planIntentBrief(
        full,
        `${focusKind}「${label}」${priceYuan != null ? `，参考售价约 ¥${priceYuan}` : ''}。本节要点：\n${body.slice(0, 900)}`,
      ),
      productType: inferProductTypeFromLabel(label, priceYuan),
    })
  }

  return intents.length > 0 ? intents : null
}

const GIFT_THRESHOLD_ONLY_RE = /^(?:消费)?满\s*[¥￥]?\d+/

function isGiftThresholdLine(label: string): boolean {
  return GIFT_THRESHOLD_ONLY_RE.test(label.replace(/\*\*/g, '').trim())
}

const GENERIC_PLAN_SECTION_LABEL_RE =
  /^(?:组品|商品|团购|推广|活动|营销|具体组品|套餐)?方案$/

function isGenericPlanSectionLabel(label: string): boolean {
  const t = label.replace(/\*\*/g, '').replace(/\s/g, '').trim()
  if (!t || t.length < 2) return true
  return GENERIC_PLAN_SECTION_LABEL_RE.test(t)
}

/** API 返回的标题若像用户原话，勿当作商品名 */
export function isLikelyUserPromptEcho(name: string, userBrief: string): boolean {
  const n = name.replace(/\s/g, '').trim()
  if (n.length < 12) return false
  if (/我要|帮我|请帮|需要|想要|出一个|根据菜单|毛利率|竞争对手|推广活动/.test(n) && n.length >= 18) {
    return true
  }
  const u = stripQuoteBlock(userBrief).replace(/\s/g, '').trim().slice(0, 36)
  if (u.length >= 12 && (n.includes(u) || u.includes(n.slice(0, Math.min(n.length, u.length))))) {
    return true
  }
  return false
}

function extractAssistantSliceForPlanParsing(userBrief: string, assistantContent?: string): string {
  const a = (assistantContent ?? '').trim()
  if (a) return a
  const u = stripQuoteBlock(userBrief)
  const idx = u.indexOf('【方案要点】')
  if (idx >= 0) return u.slice(idx + '【方案要点】'.length).trim()
  return ''
}

function buildPlanFullText(userBrief: string, assistantContent?: string): string {
  const u = stripQuoteBlock(userBrief).trim()
  const a = (assistantContent ?? '').trim()
  if (!a) return u
  if (a.length >= 40 && u.includes(a.slice(0, Math.min(80, a.length)))) return u
  return `${u}\n${a}`
}

function parseGroupBuyPriceFromSection(body: string): number | undefined {
  const m =
    body.match(/团购价\s*[：:为]?\s*(?:约)?\s*(\d+(?:\.\d+)?)\s*元?/) ??
    body.match(/(?:活动价|团价)\s*[：:为]?\s*(?:约)?\s*(\d+(?:\.\d+)?)\s*元?/)
  if (!m) return undefined
  const n = Number.parseFloat(m[1])
  return Number.isFinite(n) && n > 0 ? n : undefined
}

const NUMBERED_NAMED_PACKAGE_RE =
  /(?:^|\n)\s*(?:\*{0,2})?(\d+)[.、．]\s*(?:\*{0,2})?([^*\n\d：:（(]{2,48}(?:套餐|组合|套票|体验包|礼包|组品|双人餐|单人餐|家庭餐))(?:\*{0,2})?/gim

/** 解析「1. 科技生活体验套餐」类编号组品（含本节定价/内容） */
function parsePlanNumberedNamedPackages(full: string): CreateProductIntent[] | null {
  const matches: { start: number; end: number; label: string }[] = []
  const seen = new Set<string>()

  NUMBERED_NAMED_PACKAGE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = NUMBERED_NAMED_PACKAGE_RE.exec(full)) !== null) {
    const label = m[2].replace(/\*\*/g, '').trim().slice(0, 48)
    if (
      label.length < 2 ||
      seen.has(label) ||
      isGenericPlanSectionLabel(label) ||
      isNonProductPlanTag(label) ||
      isGiftThresholdLine(label)
    ) {
      continue
    }
    seen.add(label)
    matches.push({ start: m.index, end: m.index + m[0].length, label })
  }

  if (!matches.length) return null

  const intents: CreateProductIntent[] = []
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!
    const nextStart = matches[i + 1]?.start ?? full.length
    const body = full.slice(cur.end, nextStart).trim()
    const groupPrice = parseGroupBuyPriceFromSection(body)
    intents.push({
      key: `pkg-${i}`,
      label: cur.label,
      brief: planIntentBrief(
        full,
        `团购套餐「${cur.label}」${groupPrice != null ? `，团购价约 ¥${groupPrice}` : ''}。本节要点：\n${body.slice(0, 900)}`,
      ),
      productType: inferProductTypeFromLabel(cur.label, groupPrice),
    })
  }

  return intents.slice(0, 6)
}

const PLAN_SLOT_PATTERNS: RegExp[] = [
  /套餐[一二三四五六1-6][：:\s、]*([^\n#*]{2,48})/g,
  /组品方案\s*[一二三四五六1-6][：:\s、]+([^\n#*]{2,48})/g,
  /(?:^|\n)\s*(?:方案|套餐)[一二三四五六1-6ABCD][：:\s、]*([^\n#*]{2,48})/gm,
  /(?:^|\n)\s*(?:\d+[.、]|[-•])\s*([^\n：:]{2,36}(?:套装|组合|套餐|方案|组品))/gm,
  /(?:^|\n)\s*\d+[.、]\s*(?:\*{0,2})?(?:主推爆款|套餐组合|限时折扣|爆款套餐|组合套餐|引流套餐|福利套餐|加购套餐|次推套餐|形象套餐)(?:\*{0,2})?[：:]\s*(?:\*{0,2})?([^*\n]{2,48})/gim,
  /(?:^|\n)\s*\d+[.、]\s*(?:\*{0,2})([^*\n：:]{2,20})(?:\*{0,2})[：:]\s*(?:\*{0,2})?([^*\n]{2,48})/g,
]

const NON_PRODUCT_PLAN_TAG_RE = /优惠券|代金券|达人|招募|探店|直播|费用分配|佣金|分佣|排期|预算分配/

const NUMBERED_COMBO_TAG_RE =
  /(?:^|\n)\s*(?:\d+[.、]|[-•]\s*)?\*{0,2}((?:主推爆款|套餐组合|限时折扣|爆款套餐|组合套餐|引流套餐|福利套餐|加购套餐|次推套餐|形象套餐)[^*\n：:]{0,10})\*{0,2}[：:]\s*\*{0,2}([^*\n*]{2,56})\*{0,2}/gi

const NUMBERED_GENERIC_COLON_RE =
  /(?:^|\n)\s*(\d+)[.、]\s*\*{0,2}([^*\n：:]{2,20})\*{0,2}[：:]\s*\*{0,2}([^*\n*]{2,56})\*{0,2}/g

function slicePlanSectionBody(full: string, startIndex: number): string {
  const rest = full.slice(startIndex)
  const nextBreak = rest.search(
    /(?:^|\n)\s*(?:\d+[.、]|[-•]\s*\*{0,2}(?:主推|套餐|限时|优惠券|达人|直播|#{1,4}\s))/m,
  )
  return (nextBreak > 0 ? rest.slice(0, nextBreak) : rest.slice(0, 500)).trim()
}

function isNonProductPlanTag(tag: string): boolean {
  return NON_PRODUCT_PLAN_TAG_RE.test(tag.replace(/\*\*/g, '').trim())
}

/** 解析「1. **主推爆款：蓝牙耳机**」类推广/数码组品（与餐饮主/次套餐 Markdown 互补） */
function parsePlanNumberedComboSections(
  userBrief: string,
  assistantContent: string,
): CreateProductIntent[] | null {
  const full = `${stripQuoteBlock(userBrief)}\n${assistantContent}`
  const intents: CreateProductIntent[] = []
  const seen = new Set<string>()

  const pushCombo = (tag: string, name: string, matchEnd: number, matchText: string) => {
    const cleanTag = tag.replace(/\*\*/g, '').trim()
    const cleanName = name.replace(/\*\*/g, '').trim()
    if (cleanName.length < 2 || isNonProductPlanTag(cleanTag) || isNonProductPlanTag(cleanName)) return
    const label =
      cleanTag && !/^主推|套餐|限时|爆款|组合|引流|福利|加购|次推|形象/.test(cleanName)
        ? `${cleanTag} · ${cleanName}`.slice(0, 48)
        : cleanName.slice(0, 48)
    if (label.length < 2 || seen.has(label) || isGiftThresholdLine(label)) return
    seen.add(label)
    const body = slicePlanSectionBody(full, matchEnd)
    const priceYuan = parsePriceYuanFromText(body) ?? parsePriceYuanFromText(matchText)
    intents.push({
      key: `combo-${intents.length}`,
      label,
      brief: planIntentBrief(
        full,
        `团购套餐「${label}」${priceYuan != null ? `，参考售价约 ¥${priceYuan}` : ''}。本节要点：\n${body.slice(0, 900)}`,
      ),
      productType: inferProductTypeFromLabel(label, priceYuan),
    })
  }

  NUMBERED_COMBO_TAG_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = NUMBERED_COMBO_TAG_RE.exec(full)) !== null) {
    pushCombo(m[1], m[2], m.index + m[0].length, m[0])
  }

  if (intents.length < 2) {
    NUMBERED_GENERIC_COLON_RE.lastIndex = 0
    while ((m = NUMBERED_GENERIC_COLON_RE.exec(full)) !== null) {
      pushCombo(m[2], m[3], m.index + m[0].length, m[0])
    }
  }

  return intents.length > 0 ? intents.slice(0, 6) : null
}

function splitMarkdownTableCells(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return []
  const parts = trimmed.split('|').map((c) => c.trim())
  if (parts[0] === '') parts.shift()
  if (parts[parts.length - 1] === '') parts.pop()
  return parts
}

function isMarkdownTableSeparator(line: string): boolean {
  const t = line.trim()
  return t.includes('|') && t.includes('-') && /^[\s|:\-]+$/.test(t.replace(/-/g, ''))
}

function parsePriceYuanFromTableCell(text: string): number | undefined {
  const fromSymbol = parsePriceYuanFromText(text)
  if (fromSymbol != null) return fromSymbol
  const m = text.replace(/%/g, '').match(/(\d+(?:\.\d+)?)\s*元?/)
  if (!m) return undefined
  const n = Number.parseFloat(m[1])
  return Number.isFinite(n) && n > 0 && n < 100_000 ? n : undefined
}

/** 解析「具体组品」Markdown 表格（套餐名称 | 包含SKU | … | 团购价） */
function parsePlanMarkdownTableComboRows(
  userBrief: string,
  assistantContent: string,
): CreateProductIntent[] | null {
  const full = `${stripQuoteBlock(userBrief)}\n${assistantContent}`
  const lines = full.split('\n')

  let headerRow = -1
  let nameCol = -1
  let priceCol = -1
  let groupPriceCol = -1

  for (let i = 0; i < lines.length; i++) {
    const cells = splitMarkdownTableCells(lines[i]!)
    if (cells.length < 2) continue
    const nameIdx = cells.findIndex((c) =>
      /套餐名称|组合名称|组品名称|商品名称|套餐名/.test(c.replace(/\s/g, '')),
    )
    if (nameIdx < 0) continue
    headerRow = i
    nameCol = nameIdx
    priceCol = cells.findIndex((c) => /^(?:定价|售价|单价|价格)$/.test(c.replace(/\s/g, '')))
    groupPriceCol = cells.findIndex((c) => /团购价|团价|活动价/.test(c.replace(/\s/g, '')))
    break
  }

  if (headerRow < 0 || nameCol < 0) return null

  const intents: CreateProductIntent[] = []
  const seen = new Set<string>()

  for (let i = headerRow + 1; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (!line.includes('|')) break
    if (isMarkdownTableSeparator(line)) continue

    const cells = splitMarkdownTableCells(line)
    if (cells.length <= nameCol) continue

    const name = cells[nameCol]!.replace(/\*\*/g, '').trim()
    if (name.length < 2) continue
    if (/套餐名称|合计|小计|总计|备注|示例/.test(name)) continue
    if (isNonProductPlanTag(name) || isGiftThresholdLine(name)) continue
    if (seen.has(name)) continue
    seen.add(name)

    const priceCell =
      groupPriceCol >= 0 && groupPriceCol < cells.length
        ? cells[groupPriceCol]!
        : priceCol >= 0 && priceCol < cells.length
          ? cells[priceCol]!
          : line
    const priceYuan = parsePriceYuanFromTableCell(priceCell) ?? parsePriceYuanFromTableCell(line)
    const skuHint =
      cells.length > nameCol + 1 ? cells[nameCol + 1]!.replace(/\*\*/g, '').trim().slice(0, 120) : ''

    intents.push({
      key: `table-${intents.length}`,
      label: name.slice(0, 48),
      brief: planIntentBrief(
        full,
        `团购套餐「${name}」${priceYuan != null ? `，团购价约 ¥${priceYuan}` : ''}${skuHint ? `。包含：${skuHint}` : ''}。须按方案表格该行生成完整团购标题、售价、套餐项与说明。`,
      ),
      productType: inferProductTypeFromLabel(name, priceYuan),
    })
  }

  return intents.length > 0 ? intents.slice(0, 6) : null
}

function parsePlanSlotPatternsFromFull(full: string): CreateProductIntent[] | null {
  const slots: CreateProductIntent[] = []
  const seen = new Set<string>()

  for (const re of PLAN_SLOT_PATTERNS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(full)) !== null) {
      const rawLabel = (m[2] ?? m[1]).replace(/\*\*/g, '').trim().slice(0, 48)
      if (
        rawLabel.length < 2 ||
        seen.has(rawLabel) ||
        isNonProductPlanTag(rawLabel) ||
        isGenericPlanSectionLabel(rawLabel)
      ) {
        continue
      }
      seen.add(rawLabel)
      const body = slicePlanSectionBody(full, m.index + m[0].length)
      const groupPrice = parseGroupBuyPriceFromSection(body)
      slots.push({
        key: rawLabel,
        label: rawLabel,
        brief: planIntentBrief(
          full,
          `团购套餐「${rawLabel}」${groupPrice != null ? `，团购价约 ¥${groupPrice}` : ''}。本节要点：\n${body.slice(0, 900)}`,
        ),
        productType: inferProductTypeFromLabel(rawLabel, groupPrice),
      })
    }
  }

  return slots.length > 0 ? slots.slice(0, 6) : null
}

function filterConcreteProductIntents(intents: CreateProductIntent[]): CreateProductIntent[] {
  return intents.filter((i) => !isGenericPlanSectionLabel(i.label))
}

function pickBestCreateProductIntents(
  candidates: { source: string; intents: CreateProductIntent[] }[],
): CreateProductIntent[] {
  if (!candidates.length) return []
  const priority: Record<string, number> = {
    table: 6,
    numbered_pkg: 6,
    numbered: 5,
    markdown: 4,
    slots: 3,
    json: 2,
    menu: 1,
    user: 0,
  }
  const normalized = candidates
    .map((c) => ({ ...c, intents: filterConcreteProductIntents(c.intents) }))
    .filter((c) => c.intents.length > 0)
  if (!normalized.length) return []
  const sorted = [...normalized].sort((a, b) => {
    if (b.intents.length !== a.intents.length) return b.intents.length - a.intents.length
    return (priority[b.source] ?? 0) - (priority[a.source] ?? 0)
  })
  return sorted[0]!.intents.slice(0, 6)
}

const CN_PLAN_COUNT: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
}

function parsePlanCountFromText(text: string): number | undefined {
  const digitM = text.match(/(\d+)\s*(?:个|套)?(?:组品|套餐|商品|方案|团购)/)
  if (digitM) {
    const n = Number.parseInt(digitM[1], 10)
    if (Number.isFinite(n) && n >= 2) return Math.min(6, n)
  }
  const cnM = text.match(/([一二两三四五六])\s*(?:个|套)?(?:组品|套餐|商品|方案|团购)/)
  if (cnM) {
    const n = CN_PLAN_COUNT[cnM[1]]
    if (n && n >= 2) return Math.min(6, n)
  }
  return undefined
}


function userSpecifiedConcreteProducts(userBrief: string): boolean {
  const intents = parseCreateProductIntents(userBrief)
  if (intents.length > 1) return true
  if (intents[0]?.key !== 'main') return true
  const x = stripQuoteBlock(userBrief)
  return /(\d+)\s*代\s*(\d+)|双人|单人|三人|四人|五人|代金券|指定.*(?:商品|套餐)|上架.*(?:套餐|商品|券)/.test(x)
}

function createProductIntentsFromStoreMenu(
  _userBrief: string,
  assistantContent: string | undefined,
  full: string,
): CreateProductIntent[] | null {
  let planCount: number | undefined = parsePlanCountFromText(full)
  if (!planCount) {
    const tableRows = parsePlanMarkdownTableComboRows(_userBrief, assistantContent ?? full)
    if (tableRows?.length) planCount = tableRows.length
    else {
      const numbered = parsePlanNumberedComboSections(_userBrief, assistantContent ?? full)
      if (numbered?.length) planCount = numbered.length
      else if (/组品|套餐|团购|方案|推广|组品方案|商品方案/.test(full)) planCount = 2
    }
  }
  if (!planCount) return null
  const combos = buildMenuComboIntentLabels(planCount)
  if (!combos.length) return null
  return combos.map(({ label, menuHint }) => ({
    key: `menu-${label}`,
    label,
    brief: planIntentBrief(
      full,
      `团购套餐「${label}」，须从门店菜单价目选取真实单品并组合（不得虚构未录入品项）：${menuHint}；须给出团购售价、套餐项明细与说明。`,
    ),
    productType: 1,
  }))
}

function planIntentBrief(full: string, focus: string): string {
  return `${full}\n\n【仅生成以下一项】${focus}。不要与其它餐型或代金券合并；须输出完整团购标题、售价、套餐项与说明。`
}

const META_PRODUCT_STEP_RE =
  /自动计算|校验各商品|毛利率.*预设|标红预警|权限|requiredPermissions/i

function parsePriceYuanFromText(text: string): number | undefined {
  const m = text.match(/[¥￥]\s*(\d+(?:\.\d+)?)/)
  if (!m) return undefined
  const n = Number.parseFloat(m[1])
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function inferProductTypeFromLabel(label: string, priceYuan?: number): number {
  if (/代金券|团购券|优惠券|服务券|福利券|代\s*\d+/.test(label)) return 2
  if (priceYuan != null && priceYuan <= 50 && /券|福利|贴膜|清洁服务/.test(label)) return 2
  return 1
}

/** 从助手 JSON action 的 steps / details 拆出多个商品意图 */
function parseCreateProductIntentsFromAgentJson(
  assistantContent: string,
  userBrief: string,
): CreateProductIntent[] | null {
  const j = tryParseJsonObject(assistantContent)
  if (!j) return null
  const at = String(j.actionType ?? j.action_type ?? '').trim()
  if (at !== 'create_product' && at !== 'create_product_batch') return null

  const full = `${stripQuoteBlock(userBrief)}\n${assistantContent}`
  const intents: CreateProductIntent[] = []
  const seen = new Set<string>()

  const pushIntent = (label: string, priceYuan?: number, productType?: number) => {
    const clean = label.replace(/\*\*/g, '').trim().slice(0, 48)
    if (clean.length < 2 || seen.has(clean) || isGiftThresholdLine(clean)) return
    seen.add(clean)
    const pt = productType ?? inferProductTypeFromLabel(clean, priceYuan)
    intents.push({
      key: clean,
      label: clean,
      brief: planIntentBrief(
        full,
        `${pt === 2 ? '代金券/福利券' : '团购套餐'}「${clean}」${priceYuan != null ? `，售价约 ¥${priceYuan}` : ''}`,
      ),
      productType: pt,
    })
  }

  const parseCreateStep = (step: string): void => {
    const s = step.trim()
    const isCreate = /^创建/.test(s)
    const isVoucherSetup = /^设置(?:代金券|优惠券|团购券)/.test(s)
    if (!isCreate && !isVoucherSetup) return
    if (/^设置赠品|^赠品策略|^加赠/.test(s)) return
    if (META_PRODUCT_STEP_RE.test(s) && !/[¥￥]\d/.test(s) && !isVoucherSetup) return

    if (isVoucherSetup) {
      const body = s.replace(/^设置(?:代金券|优惠券|团购券)[：:]\s*/, '').trim()
      const label = body.replace(/[。.]+$/u, '').slice(0, 48) || '代金券组合'
      const priceYuan = parsePriceYuanFromText(body)
      pushIntent(`代金券 · ${label}`, priceYuan, 2)
      return
    }

    const priceYuan = parsePriceYuanFromText(s)

    const comboColon = s.match(/^创建(?:团购)?套餐[：:]\s*(.+)$/u)
    if (comboColon) {
      const body = comboColon[1].replace(/[。.]+$/u, '').trim()
      const name = body
        .replace(/[，,]\s*(?:售价|团购价)?[¥￥]\s*\d+(?:\.\d+)?\s*元?/gu, '')
        .replace(/(?:售价|团购价)?[¥￥]\s*\d+(?:\.\d+)?\s*元?/gu, '')
        .trim()
      pushIntent(name || body, priceYuan ?? parsePriceYuanFromText(body))
      return
    }

    const tagged = s.match(/的\s*[「【]([^」】]+)[」】]\s*(.+)$/)
    if (tagged) {
      const label = `【${tagged[1].trim()}】${tagged[2].replace(/套餐$/u, '').trim()}`.trim()
      pushIntent(label, priceYuan)
      return
    }

    const afterPrice = s.match(/(?:售价)?[¥￥]?\s*\d+(?:\.\d+)?\s*(?:元)?的?\s*(.+)$/)
    if (afterPrice) {
      pushIntent(afterPrice[1].replace(/套餐$/u, '').trim(), priceYuan)
      return
    }

    const plain = s.match(/^创建(?:一个|一款)?(.{4,60})$/)
    if (plain) pushIntent(plain[1].trim(), priceYuan)
  }

  const parseDetailLine = (line: unknown): void => {
    if (line == null) return
    if (typeof line === 'object' && !Array.isArray(line)) {
      const r = line as Record<string, unknown>
      const name = String(r.name ?? r.title ?? r.productName ?? r.label ?? '').trim()
      const priceYuan =
        parsePriceYuanFromApi(r.price ?? r.suggestedPriceYuan ?? r.priceYuan) ??
        parsePriceYuanFromText(String(r.summary ?? ''))
      if (name) pushIntent(name, priceYuan)
      return
    }
    const s = String(line).trim()
    if (!s) return
    const priceYuan = parsePriceYuanFromText(s)
    const pipe = s.match(/[：:]\s*\[?([^\]|]+)\]?\s*(?:[¥￥]\s*\d+(?:\.\d+)?)?\s*[|｜]\s*(.+)/)
    if (pipe) {
      const tag = pipe[1].trim()
      const body = pipe[2].trim()
      pushIntent(tag.startsWith('【') ? `${tag} ${body}` : `【${tag}】${body}`, priceYuan)
      return
    }
    const bracket = s.match(/\[([^\]]+)\]\s*(.+)/)
    if (bracket) {
      pushIntent(`【${bracket[1].trim()}】${bracket[2].trim()}`, priceYuan)
      return
    }
    parseCreateStep(s)
  }

  const details = j.details
  if (Array.isArray(details)) {
    for (const row of details) parseDetailLine(row)
  }

  if (intents.length === 0) {
    const steps = j.steps
    if (Array.isArray(steps)) {
      for (const step of steps) {
        if (typeof step === 'string') parseCreateStep(step)
      }
    }
  }

  return intents.length > 0 ? intents.slice(0, 6) : null
}

/** 商品创建步骤结束后引导用户选择下一步 */
export function buildProductTaskFollowUpPrompt(opts: {
  okCount: number
  failCount: number
  hadRecruitInPlan?: boolean
}): string {
  const lines: string[] = []
  if (opts.okCount > 0 && opts.failCount === 0) {
    lines.push('商品创建步骤已完成。')
  } else if (opts.okCount > 0) {
    lines.push(`商品创建步骤已结束：${opts.okCount} 项已写入草稿，${opts.failCount} 项未成功。`)
  } else {
    lines.push('商品创建步骤已结束，本次未能写入草稿（常见原因：创建商品页尚未保存类目与门店）。')
  }
  lines.push('')
  lines.push('接下来您希望我帮您做什么？可直接回复，例如：')
  if (opts.hadRecruitInPlan) {
    lines.push('· 「帮我安排达人招募」—— 生成达人探店 Brief 预览')
  } else {
    lines.push('· 「帮我安排达人招募」—— 若需达人种草/探店')
  }
  lines.push('· 说明要调整的商品方案或重新生成预览')
  lines.push('· 继续其它推广/运营任务')
  return lines.join('\n')
}

/** 结合助手方案中的套餐/组品条目拆出多个上架意图 */
export function parseCreateProductIntentsFromPlan(
  userBrief: string,
  assistantContent?: string,
): CreateProductIntent[] {
  const assistantSlice = extractAssistantSliceForPlanParsing(userBrief, assistantContent)
  const full = buildPlanFullText(userBrief, assistantSlice || assistantContent)
  const hasPlanCorpus =
    assistantSlice.length >= 40 || (assistantContent?.trim()?.length ?? 0) >= 40 || full.length >= 200

  const candidates: { source: string; intents: CreateProductIntent[] }[] = []

  if (hasPlanCorpus) {
    const planUser = stripQuoteBlock(userBrief)
    const planAssistant = assistantSlice || assistantContent?.trim() || full

    const fromTable = parsePlanMarkdownTableComboRows(planUser, planAssistant)
    if (fromTable?.length) candidates.push({ source: 'table', intents: fromTable })

    const fromMarkdown = parsePlanMarkdownProductSections(planUser, planAssistant)
    if (fromMarkdown?.length) candidates.push({ source: 'markdown', intents: fromMarkdown })

    const fromNumbered = parsePlanNumberedComboSections(planUser, planAssistant)
    if (fromNumbered?.length) candidates.push({ source: 'numbered', intents: fromNumbered })

    const fromNumberedPackages = parsePlanNumberedNamedPackages(full)
    if (fromNumberedPackages?.length) {
      candidates.push({ source: 'numbered_pkg', intents: fromNumberedPackages })
    }

    const fromJson = parseCreateProductIntentsFromAgentJson(planAssistant, planUser)
    if (fromJson?.length) candidates.push({ source: 'json', intents: fromJson })

    const fromSlots = parsePlanSlotPatternsFromFull(full)
    if (fromSlots?.length) candidates.push({ source: 'slots', intents: fromSlots })

    const best = pickBestCreateProductIntents(candidates)
    if (best.length) return best
  }

  const fromUser = parseCreateProductIntents(userBrief)
  if (!hasPlanCorpus) {
    if (!userSpecifiedConcreteProducts(userBrief)) {
      const fromMenu = createProductIntentsFromStoreMenu(
        userBrief,
        undefined,
        stripQuoteBlock(userBrief),
      )
      if (fromMenu?.length) return fromMenu
    }
    return fromUser
  }
  if (fromUser.length > 1 || (fromUser.length === 1 && fromUser[0].key !== 'main')) {
    candidates.push({ source: 'user', intents: fromUser })
  }

  const planCount = parsePlanCountFromText(full)
  if (planCount && planCount > 1) {
    if (!userSpecifiedConcreteProducts(userBrief)) {
      const fromMenu = createProductIntentsFromStoreMenu(userBrief, assistantContent, full)
      if (fromMenu?.length) candidates.push({ source: 'menu', intents: fromMenu })
    } else {
      candidates.push({
        source: 'user',
        intents: Array.from({ length: planCount }, (_, i) => ({
          key: `plan-${i + 1}`,
          label: `方案 ${i + 1}`,
          brief: planIntentBrief(
            full,
            `第 ${i + 1} 个团购方案（共 ${planCount} 个，须相互区分售价与内容）`,
          ),
          productType: 1,
        })),
      })
    }
  }

  if (!userSpecifiedConcreteProducts(userBrief)) {
    const fromMenu = createProductIntentsFromStoreMenu(userBrief, assistantContent, full)
    if (fromMenu?.length) candidates.push({ source: 'menu', intents: fromMenu })
  }

  const best = pickBestCreateProductIntents(candidates)
  if (best.length) return best

  return fromUser
}

/** 方案同时含「组品/上架」与「达人招募」时需分步执行，不可合并预览 */
export function hasCombinedProductAndRecruitPlan(
  userText: string,
  assistantContent?: string,
  explicitTaskType?: AiTaskType,
): boolean {
  if (!isPlanOrNineScenarioQuery(userText) && !isExplicitExecutionIntent(userText)) return false
  const types = inferTaskTypesFromCombinedContext(userText, assistantContent, explicitTaskType)
  return types.includes('create_product') && types.includes('recruit_influencer')
}

/** 是否应推迟自动预览（等用户确认后再生成执行预览） */
export function shouldDeferTaskPreview(
  userText: string,
  assistantContent?: string,
  explicitTaskType?: AiTaskType,
): boolean {
  if (isAgentShortcutTaskLine(userText)) return false
  if (isExplicitExecutionIntent(userText)) return false
  if (isInformationalOnlyQuery(userText)) return true
  if (
    filterScenarioTaskTypes(
      inferTaskTypesFromCombinedContext(userText, assistantContent, explicitTaskType),
    ).length > 0
  ) {
    return true
  }
  if (hasCombinedProductAndRecruitPlan(userText, assistantContent, explicitTaskType)) return true
  if (assistantContent && parseAgentConfirmRequired(assistantContent)) return true
  if (isPlanOrNineScenarioQuery(userText)) return true
  if (assistantContent && looksLikePlanDocument(assistantContent)) return true
  return false
}
