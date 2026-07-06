import type { RecruitOrderPickerRow } from '../lib/aiRecruitOrderContext'
import { postDouyinGoodsAiAssist, type AiModelId } from './douyinAiAssistApi'
import { readTextAiAuto, resolveTextAiModelForRequest } from './merchantAiModelStorage'
import { pickViralBriefReferenceCases, type ViralBriefReferenceCase } from './viralBriefCaseLibrary'

/** Brief 文案：豆包 → 通义千问 → MiniMax（失败自动切换） */
const BRIEF_TEXT_VENDORS: AiModelId[] = ['doubao', 'qwen', 'minimax']

function briefVendorOrder(): AiModelId[] {
  const order: AiModelId[] = []
  if (!readTextAiAuto()) {
    const preferred = resolveTextAiModelForRequest() as AiModelId
    if (BRIEF_TEXT_VENDORS.includes(preferred)) order.push(preferred)
  }
  for (const v of BRIEF_TEXT_VENDORS) {
    if (!order.includes(v)) order.push(v)
  }
  return order
}

/** Brief 页展示：自动模式下豆包优先，手动模式尊重用户选择 */
export function resolveBriefTextAiModelForRequest(): AiModelId {
  return briefVendorOrder()[0] || 'doubao'
}

export function briefVendorFallbackHint(): string {
  const rest = briefVendorOrder().slice(1)
  const labels: Record<AiModelId, string> = {
    doubao: '豆包',
    qwen: '通义千问',
    minimax: 'MiniMax',
  }
  const tail = rest.map((id) => labels[id] || id).join('、')
  return tail || '其他已配置文案模型'
}

/** 面向达人的错误文案：去掉上游/模型 ID/Ark 等术语 */
export function formatBriefUserError(msg: string): string {
  let s = String(msg || '').trim()
  s = s.replace(/^上游模型调用失败[：:]\s*/i, '')
  s = s.replace(/\(已尝试[：:][^)]+\)/g, '')
  s = s.replace(/（已尝试[：:][^）]+）/g, '')
  s = s.replace(/This operation was aborted/i, '请求超时')
  s = s.replace(/火山\s*Ark|ark\s*api|2\.1-pro|2\.0-pro|Character|Seedream|2061/gi, '')
  s = s.replace(/\s{2,}/g, ' ').trim()
  if (/超时|aborted|timeout/i.test(s)) {
    return '文案生成超时，请稍后重试；若多次失败请联系管理员检查 AI 配置。'
  }
  if (/未配置|NEED_VENDOR_KEY|缺少.*凭据|api key/i.test(s)) {
    return `${s} 请在系统设置中完成 AI 模型配置。`
  }
  return s || '文案生成失败，请稍后重试。'
}

export type ViralBriefPlatform = 'douyin' | 'xiaohongshu' | 'dianping' | 'channels' | 'kuaishou'
export type ViralBriefStyle =
  | 'review'
  | 'story'
  | 'listicle'
  | 'store_visit'
  | 'deal_push'
  | 'atmosphere'
  | 'guide'
  | 'real_review'
  | 'holiday_theme'
  | 'punch_in'

export type ViralBriefSolution = {
  title: string
  desc: string
  relatedRoles?: string[]
}

export type ViralBriefScene = {
  scene: string
  visual: string
  voice: string
  subtitle?: string
}

export type ViralCopySection = {
  heading: string
  content: string
}

export type ViralBriefOutputMode = 'video_brief' | 'copy_manuscript'

export type ViralBriefResult = {
  outputMode: ViralBriefOutputMode
  platform: ViralBriefPlatform
  style: ViralBriefStyle
  requirementSummary: string
  unifiedSolutions: ViralBriefSolution[]
  hooks: string[]
  titles: string[]
  structure: ViralBriefScene[]
  mustMention: string[]
  forbidden: string[]
  topics: string[]
  roles: { talent?: string; shoot?: string; edit?: string }
  checklist: string[]
  /** 图文文稿：封面/笔记标题备选 */
  coverTitles?: string[]
  /** 图文文稿：开篇段落 */
  openingParagraph?: string
  /** 图文文稿：正文分段 */
  bodySections?: ViralCopySection[]
  /** 图文文稿：结尾互动/行动号召 */
  closingParagraph?: string
  /** 图文文稿：完整可发布正文 */
  fullCopy?: string
  /** 相似案例参考：检索到的短视频与拍摄场景图（非 AI 生成） */
  referenceCases?: ViralBriefReferenceCase[]
  fullMarkdown: string
}

const STYLE_LABELS: Record<ViralBriefStyle, string> = {
  review: '测评理性种草',
  story: '故事场景叙事',
  listicle: '热点清单体',
  store_visit: '探店 Vlog',
  deal_push: '团购引流转化',
  atmosphere: '氛围出片感',
  guide: '本地攻略清单',
  real_review: '真实体验测评',
  holiday_theme: '节日主题活动',
  punch_in: '打卡目的地',
}

export const STYLE_OPTIONS: { id: ViralBriefStyle; label: string }[] = (
  Object.entries(STYLE_LABELS) as [ViralBriefStyle, string][]
).map(([id, label]) => ({ id, label }))

const PLATFORM_LABELS: Record<ViralBriefPlatform, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  dianping: '大众点评',
  channels: '微信视频号',
  kuaishou: '快手',
}

export const PLATFORM_OPTIONS: { id: ViralBriefPlatform; label: string }[] = (
  Object.entries(PLATFORM_LABELS) as [ViralBriefPlatform, string][]
).map(([id, label]) => ({ id, label }))

function extractJson(text: string): Record<string, unknown> | null {
  const t = String(text || '').trim()
  if (!t) return null
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as Record<string, unknown>
    } catch {
      return null
    }
  }
  let j = tryParse(t)
  if (j) return j
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    j = tryParse(fence[1].trim())
    if (j) return j
  }
  const obj = t.match(/\{[\s\S]*\}/)
  if (obj) {
    j = tryParse(obj[0])
    if (j) return j
  }
  return null
}

/** 去掉 AI 常输出的 Markdown 装饰（**、#、代码围栏等） */
export function stripAiMarkdown(text: string): string {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/\*(.+?)\*/gs, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .trim()
}

const JSON_ONLY_PREFIX = [
  '【输出格式强制】忽略「写公众号/图文稿件」类体裁要求。',
  '你只输出一个合法 JSON 对象：禁止 Markdown、禁止 ** 或 # 标题、禁止代码围栏、禁止 JSON 外的任何说明。',
  '',
].join('\n')

function sanitizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => stripAiMarkdown(String(x))).filter(Boolean)
}

function extractJsonLenient(text: string): Record<string, unknown> | null {
  const direct = extractJson(text)
  if (direct) return direct
  const start = text.indexOf('{')
  if (start < 0) return null
  let tail = text.slice(start).trim().replace(/,\s*$/, '')
  for (let i = 0; i < 12; i++) {
    try {
      return JSON.parse(tail) as Record<string, unknown>
    } catch {
      tail += '}'
    }
  }
  return null
}

function looksLikeMarkdownArticle(text: string): boolean {
  const t = String(text || '').trim()
  return /^#{1,3}\s/m.test(t) || /^\*\*[^*]+\*\*/m.test(t) || (t.length > 1200 && !t.trimStart().startsWith('{'))
}

function asStringList(raw: unknown): string[] {
  return sanitizeStringList(raw)
}

export function resolveViralBriefPlatform(order: RecruitOrderPickerRow | null): ViralBriefPlatform {
  const p = String(order?.platform || '').trim()
  if (/大众|点评|dianping/i.test(p)) return 'dianping'
  if (/快手|kuaishou/i.test(p)) return 'kuaishou'
  if (/视频号|channels|weixin.*视频/i.test(p)) return 'channels'
  if (/红|xhs|xiaohongshu/i.test(p)) return 'xiaohongshu'
  return 'douyin'
}

/** 小红书、大众点评为图文文稿平台（非视频分镜 Brief） */
export function isCopyManuscriptPlatform(platform: ViralBriefPlatform): boolean {
  return platform === 'xiaohongshu' || platform === 'dianping'
}

function buildOrderContext(order: RecruitOrderPickerRow, extraHint?: string): string {
  const hint = String(extraHint || '').trim()
  const base = String(order.recruitContent || '').trim()
  return [
    `招募标题：${order.title || '—'}`,
    `平台：${order.platform || '—'}`,
    `区域：${order.region || '—'}`,
    `品类：${order.category || '—'}`,
    hint ? `PR 补充要点：${hint}` : '',
    '',
    base || '（订单详情为空，请结合标题与品类发挥）',
  ]
    .filter(Boolean)
    .join('\n')
}

function platformLabel(platform: ViralBriefPlatform): string {
  return PLATFORM_LABELS[platform] || '抖音'
}

function platformBriefHint(platform: ViralBriefPlatform): string {
  switch (platform) {
    case 'xiaohongshu':
      return '小红书侧重：封面标题、真实测评感、清单/攻略结构、SEO 关键词。'
    case 'dianping':
      return '大众点评侧重：星级评价感、消费体验细节、菜品/服务描述、收藏打卡与团购引导。'
    case 'kuaishou':
      return '快手侧重：接地气口播、真实记录感、老铁互动、团购/私信转化。'
    case 'channels':
      return '微信视频号侧重：私域引流、熟人社交传播、简洁口播、公众号/小程序跳转。'
    default:
      return '抖音侧重：15～60s、强钩子、口播节奏、转化动作（到店/团购/私信）。'
  }
}

function styleBriefHint(style: ViralBriefStyle): string {
  switch (style) {
    case 'store_visit':
      return '探店 Vlog：第一视角逛店、动线清晰、口播自然、突出招牌体验与出片点位。'
    case 'deal_push':
      return '团购引流：强调套餐性价比、限时福利、下单路径与到店核销动作。'
    case 'atmosphere':
      return '氛围出片：光影、装修、摆盘、BGM 情绪，弱化硬广、强化「想去」感。'
    case 'guide':
      return '本地攻略：清单体/路线体，适合周边逛吃、一日安排、避坑 Tips。'
    case 'real_review':
      return '真实测评：优缺点均衡、体验细节、适合建立信任与理性种草。'
    case 'holiday_theme':
      return '节日主题：结合节庆/周末/亲子/约会场景，突出限时活动与情绪价值。'
    case 'punch_in':
      return '打卡目的地：地标/网红点位、拍照机位、社交分享话术与话题标签。'
    case 'story':
      return '故事叙事：场景化人物关系或小剧情，自然带出产品/门店。'
    case 'listicle':
      return '热点清单：蹭热点或 TOP N 结构，信息密度高、节奏快。'
    default:
      return '测评种草：理性分析卖点、对比同类、给出明确推荐结论。'
  }
}

function formatFullMarkdown(result: Omit<ViralBriefResult, 'fullMarkdown'>): string {
  if (result.outputMode === 'copy_manuscript') {
    return formatCopyMarkdown(result)
  }
  const lines: string[] = [
    `爆款 Brief · ${platformLabel(result.platform)} · ${STYLE_LABELS[result.style]}`,
    '',
    '一、需求汇总',
    result.requirementSummary || '—',
    '',
    '二、解决方案',
  ]
  for (const s of result.unifiedSolutions) {
    lines.push(`- ${s.title}：${s.desc}`)
  }
  lines.push('', '三、爆款钩子（前 3 秒）')
  result.hooks.forEach((h, i) => lines.push(`${i + 1}. ${h}`))
  lines.push('', '四、标题 / 封面文案')
  result.titles.forEach((t, i) => lines.push(`${i + 1}. ${t}`))
  lines.push('', '五、内容结构 / 分镜')
  result.structure.forEach((sc, i) => {
    lines.push(`镜头 ${i + 1}：${sc.scene}`)
    lines.push(`- 画面：${sc.visual}`)
    lines.push(`- 口播：${sc.voice}`)
    if (sc.subtitle) lines.push(`- 字幕：${sc.subtitle}`)
  })
  lines.push('', '六、必提卖点')
  result.mustMention.forEach((m) => lines.push(`- ${m}`))
  lines.push('', '七、禁忌事项')
  result.forbidden.forEach((m) => lines.push(`- ${m}`))
  lines.push('', '八、话题 / 标签')
  lines.push(result.topics.join(' '))
  lines.push('', '九、执行分工')
  if (result.roles.talent) lines.push(`- 达人：${result.roles.talent}`)
  if (result.roles.shoot) lines.push(`- 拍摄：${result.roles.shoot}`)
  if (result.roles.edit) lines.push(`- 剪辑：${result.roles.edit}`)
  lines.push('', '十、审片 Checklist')
  result.checklist.forEach((c) => lines.push(`- [ ] ${c}`))
  if (result.referenceCases?.length) {
    lines.push('', '十一、相似案例参考（检索）')
    result.referenceCases.forEach((c, i) => {
      lines.push(`${i + 1}. ${c.title}（${c.aiPickReason || c.matchReason}）`)
      if (c.originalVideoUrl) lines.push(`- 参考视频：${c.originalVideoUrl}`)
      for (const img of c.originalSceneImages || c.sceneImages) lines.push(`- 场景图：${img}`)
    })
  }
  return stripAiMarkdown(lines.join('\n'))
}

function formatCopyMarkdown(result: Omit<ViralBriefResult, 'fullMarkdown'>): string {
  const plat = platformLabel(result.platform)
  const lines: string[] = [
    `爆款文稿 · ${plat} · ${STYLE_LABELS[result.style]}`,
    '',
    '一、需求汇总',
    result.requirementSummary || '—',
    '',
    '二、解决方案',
  ]
  for (const s of result.unifiedSolutions) {
    lines.push(`- ${s.title}：${s.desc}`)
  }
  lines.push('', '三、标题 / 封面文案（备选）')
  ;(result.coverTitles ?? result.titles).forEach((t, i) => lines.push(`${i + 1}. ${t}`))
  if (result.openingParagraph) {
    lines.push('', '四、开篇')
    lines.push(result.openingParagraph)
  }
  lines.push('', '五、正文')
  if (result.bodySections?.length) {
    for (const sec of result.bodySections) {
      lines.push(`【${sec.heading}】`)
      lines.push(sec.content)
      lines.push('')
    }
  } else if (result.fullCopy) {
    lines.push(result.fullCopy)
  }
  if (result.closingParagraph) {
    lines.push('', '六、结尾互动')
    lines.push(result.closingParagraph)
  }
  lines.push('', '七、必提卖点')
  result.mustMention.forEach((m) => lines.push(`- ${m}`))
  lines.push('', '八、禁忌事项')
  result.forbidden.forEach((m) => lines.push(`- ${m}`))
  lines.push('', '九、话题 / 标签 / SEO')
  lines.push(result.topics.join(' '))
  if (result.fullCopy) {
    lines.push('', '— 完整可发布文稿 —', result.fullCopy)
  }
  return stripAiMarkdown(lines.join('\n').trim())
}

function parseCopyResult(
  parsed: Record<string, unknown>,
  platform: ViralBriefPlatform,
  style: ViralBriefStyle,
  fallbackText: string,
): ViralBriefResult {
  const solutions = Array.isArray(parsed.unifiedSolutions)
    ? (parsed.unifiedSolutions as Record<string, unknown>[]).map((s) => ({
        title: stripAiMarkdown(String(s.title || '方案')),
        desc: stripAiMarkdown(String(s.desc || '')),
        relatedRoles: asStringList(s.relatedRoles),
      }))
    : []

  const bodySections = Array.isArray(parsed.bodySections)
    ? (parsed.bodySections as Record<string, unknown>[]).map((s, i) => ({
        heading: stripAiMarkdown(String(s.heading || `段落${i + 1}`)),
        content: stripAiMarkdown(String(s.content || '')),
      }))
    : []

  const coverTitles = asStringList(parsed.coverTitles ?? parsed.titles)
  const fullCopy = stripAiMarkdown(String(parsed.fullCopy || ''))
  const partial: Omit<ViralBriefResult, 'fullMarkdown'> = {
    outputMode: 'copy_manuscript',
    platform,
    style,
    requirementSummary:
      stripAiMarkdown(String(parsed.requirementSummary || '')) || stripAiMarkdown(fallbackText),
    unifiedSolutions: solutions,
    hooks: [],
    titles: coverTitles,
    structure: [],
    mustMention: asStringList(parsed.mustMention),
    forbidden: asStringList(parsed.forbidden),
    topics: asStringList(parsed.topics),
    roles: {},
    checklist: asStringList(parsed.checklist),
    coverTitles,
    openingParagraph: stripAiMarkdown(String(parsed.openingParagraph || '')) || undefined,
    bodySections,
    closingParagraph: stripAiMarkdown(String(parsed.closingParagraph || '')) || undefined,
    fullCopy: fullCopy || undefined,
  }
  return { ...partial, fullMarkdown: formatFullMarkdown(partial) }
}

function parseBriefResult(
  parsed: Record<string, unknown>,
  platform: ViralBriefPlatform,
  style: ViralBriefStyle,
  fallbackText: string,
): ViralBriefResult {
  const solutions = Array.isArray(parsed.unifiedSolutions)
    ? (parsed.unifiedSolutions as Record<string, unknown>[]).map((s) => ({
        title: stripAiMarkdown(String(s.title || '方案')),
        desc: stripAiMarkdown(String(s.desc || '')),
        relatedRoles: asStringList(s.relatedRoles),
      }))
    : []

  const structure = Array.isArray(parsed.structure)
    ? (parsed.structure as Record<string, unknown>[]).map((s, i) => ({
        scene: stripAiMarkdown(String(s.scene || `段落${i + 1}`)),
        visual: stripAiMarkdown(String(s.visual || '')),
        voice: stripAiMarkdown(String(s.voice || '')),
        subtitle: stripAiMarkdown(String(s.subtitle || '')) || undefined,
      }))
    : []

  const partial: Omit<ViralBriefResult, 'fullMarkdown'> = {
    outputMode: 'video_brief',
    platform,
    style,
    requirementSummary:
      stripAiMarkdown(String(parsed.requirementSummary || '')) ||
      stripAiMarkdown(fallbackText),
    unifiedSolutions: solutions,
    hooks: asStringList(parsed.hooks),
    titles: asStringList(parsed.titles),
    structure,
    mustMention: asStringList(parsed.mustMention),
    forbidden: asStringList(parsed.forbidden),
    topics: asStringList(parsed.topics),
    roles: {
      talent:
        stripAiMarkdown(String((parsed.roles as Record<string, unknown>)?.talent || parsed.talentRole || '')) ||
        undefined,
      shoot:
        stripAiMarkdown(String((parsed.roles as Record<string, unknown>)?.shoot || parsed.shootRole || '')) ||
        undefined,
      edit:
        stripAiMarkdown(String((parsed.roles as Record<string, unknown>)?.edit || parsed.editRole || '')) ||
        undefined,
    },
    checklist: asStringList(parsed.checklist),
  }

  return { ...partial, fullMarkdown: formatFullMarkdown(partial) }
}

function isBriefAiHopable(msg: string): boolean {
  const raw = String(msg || '')
  if (/does not exist|do not have access|not have access to it|model.*not.*found|unknown model|invalid.*model|endpoint.*not/i.test(raw))
    return true
  if (/inference limit|safe experience mode|model service has been paused|推理限额|安全体验模式|模型服务已暂停/i.test(raw))
    return true
  return /额度|限流|quota|limit|hopable|502|503|401|403|upstream|timeout|fetch failed|failed to parse url|access denied|已尝试：|aborted/i.test(
    raw,
  )
}

async function chat(titleDraft: string, productName: string): Promise<string> {
  let lastMsg = 'AI 请求失败'
  for (const model of briefVendorOrder()) {
    const r = await postDouyinGoodsAiAssist({
      model,
      action: 'operation_article',
      product_name: productName,
      title_draft: titleDraft,
    })
    if (r.ok) return String(r.description || '').trim()
    lastMsg = r.message || lastMsg
    if (!isBriefAiHopable(lastMsg)) break
  }
  throw new Error(formatBriefUserError(lastMsg))
}

function buildLocalRequirementSummary(order: RecruitOrderPickerRow, extraHint?: string): string {
  const parts = [
    order.title,
    order.category,
    order.region,
    order.platform,
    order.recruitContent,
    extraHint,
  ]
    .map((x) => stripAiMarkdown(String(x || '')).trim())
    .filter((x) => x.length >= 2)
  return parts.join('\n') || order.title || '招募订单'
}

/** 仅生成 Brief 文字版（单次 AI 请求，不再单独跑归纳步骤） */
export async function generateViralBriefText(args: {
  order: RecruitOrderPickerRow
  platform?: ViralBriefPlatform
  style?: ViralBriefStyle
  extraHint?: string
  onProgress?: (msg: string) => void
}): Promise<ViralBriefResult> {
  const platform = args.platform || resolveViralBriefPlatform(args.order)
  const style = args.style || 'review'
  const ctx = buildOrderContext(args.order, args.extraHint)
  const plat = platformLabel(platform)
  const styleLabel = STYLE_LABELS[style]

  const requirementSummary = buildLocalRequirementSummary(args.order, args.extraHint)
  const unifiedSolutions: ViralBriefSolution[] = []

  args.onProgress?.('正在生成 Brief 文字版…')

  const copyMode = isCopyManuscriptPlatform(platform)
  const briefPrompt = copyMode
    ? [
        JSON_ONLY_PREFIX,
        `你是${plat}图文种草爆款文案总监。风格：${styleLabel}。`,
        `基于下列需求汇总，输出${plat}达人可直接发布的图文种草文稿 JSON（禁止视频分镜/口播/镜头字段）：`,
        `{`,
        `  "requirementSummary": "可沿用或精炼",`,
        `  "unifiedSolutions": [...],`,
        `  "coverTitles": ["笔记标题/封面文案1", "...共5条"],`,
        `  "openingParagraph": "开篇钩子段落 80～150字",`,
        `  "bodySections": [{"heading":"小标题","content":"正文段落150～300字"}],`,
        `  "closingParagraph": "结尾互动与行动号召",`,
        `  "fullCopy": "完整可发布文稿（含标题+正文，800～1500字，分段换行）",`,
        `  "mustMention": ["必提卖点"],`,
        `  "forbidden": ["禁忌/合规"],`,
        `  "topics": ["#话题1","SEO关键词2"],`,
        `  "checklist": ["发布前自检项"]`,
        `}`,
        platform === 'xiaohongshu'
          ? '小红书文稿：真实体验感、emoji 适度、分段清晰、适合笔记阅读；标题要有搜索关键词。'
          : '大众点评文稿：消费体验细节、星级评价感、菜品/服务描述、收藏打卡与团购引导语气。',
        styleBriefHint(style),
        '',
        `【需求汇总】\n${requirementSummary}`,
        unifiedSolutions.length
          ? `【解决方案】\n${unifiedSolutions.map((s, i) => `${i + 1}. ${s.title}：${s.desc}`).join('\n')}`
          : '',
        '',
        `【订单原文】\n${ctx}`,
      ]
        .filter(Boolean)
        .join('\n')
    : [
        JSON_ONLY_PREFIX,
        `你是${plat}爆款内容总监。风格：${styleLabel}。`,
        `基于下列需求汇总，输出${plat}达人可执行的爆款 Brief JSON（字段齐全，数组至少 3 项）：`,
        `{`,
        `  "requirementSummary": "可沿用或精炼",`,
        `  "unifiedSolutions": [...],`,
        `  "hooks": ["前3秒钩子1","钩子2","钩子3"],`,
        `  "titles": ["标题/封面文案1", "...共5条"],`,
        `  "structure": [{"scene":"段落名","visual":"画面","voice":"口播","subtitle":"字幕"}],`,
        `  "mustMention": ["必提卖点"],`,
        `  "forbidden": ["禁忌/合规"],`,
        `  "topics": ["#话题1","关键词2"],`,
        `  "roles": {"talent":"达人要点","shoot":"拍摄要点","edit":"剪辑要点"},`,
        `  "checklist": ["审片必达项"]`,
        `}`,
        platformBriefHint(platform),
        styleBriefHint(style),
        '',
        `【需求汇总】\n${requirementSummary}`,
        unifiedSolutions.length
          ? `【解决方案】\n${unifiedSolutions.map((s, i) => `${i + 1}. ${s.title}：${s.desc}`).join('\n')}`
          : '',
        '',
        `【订单原文】\n${ctx}`,
      ]
        .filter(Boolean)
        .join('\n')

  let briefText = await chat(
    briefPrompt,
    copyMode ? `爆款文稿｜${plat}｜${args.order.title}` : `爆款Brief｜${plat}｜${args.order.title}`,
  )
  let parsed = extractJsonLenient(briefText)
  if (!parsed) {
    args.onProgress?.('正在重试生成（JSON 格式）…')
    briefText = await chat(
      `${briefPrompt}\n\n上次输出无法解析，请严格只输出完整 JSON，所有字段必须存在（空数组可接受）。`,
      `爆款Brief重试｜${plat}｜${args.order.title}`,
    )
    parsed = extractJsonLenient(briefText)
  }

  if (!parsed) {
    const partial: Omit<ViralBriefResult, 'fullMarkdown'> = copyMode
      ? {
          outputMode: 'copy_manuscript',
          platform,
          style,
          requirementSummary,
          unifiedSolutions,
          hooks: [],
          titles: [],
          structure: [],
          mustMention: [],
          forbidden: [],
          topics: [],
          roles: {},
          checklist: [],
          fullCopy: stripAiMarkdown(briefText) || undefined,
        }
      : {
          outputMode: 'video_brief',
          platform,
          style,
          requirementSummary,
          unifiedSolutions,
          hooks: [],
          titles: [],
          structure: [],
          mustMention: [],
          forbidden: [],
          topics: [],
          roles: {},
          checklist: [],
        }
    const appendix = stripAiMarkdown(briefText)
    return {
      ...partial,
      fullMarkdown: appendix ? `${formatFullMarkdown(partial)}\n\n---\n${appendix}` : formatFullMarkdown(partial),
    }
  }

  if (!parsed.requirementSummary) parsed.requirementSummary = requirementSummary
  if (!parsed.unifiedSolutions && unifiedSolutions.length) parsed.unifiedSolutions = unifiedSolutions

  const baseResult = copyMode
    ? parseCopyResult(parsed, platform, style, briefText)
    : parseBriefResult(parsed, platform, style, briefText)

  return baseResult
}

/** 在已有文字 Brief 上补充相似案例检索（失败不抛错，返回原结果） */
export async function searchViralBriefReferences(args: {
  order: RecruitOrderPickerRow
  platform?: ViralBriefPlatform
  style?: ViralBriefStyle
  brief: ViralBriefResult
  onProgress?: (msg: string) => void
}): Promise<{ result: ViralBriefResult; searchNote?: string }> {
  const platform = args.platform || args.brief.platform
  const style = args.style || args.brief.style
  if (isCopyManuscriptPlatform(platform)) {
    return { result: args.brief }
  }
  args.onProgress?.('正在检索相似探店视频与场景图…')
  try {
    const referenceCases = await pickViralBriefReferenceCases({
      order: args.order,
      platform,
      style,
      brief: args.brief,
      onProgress: args.onProgress,
    })
    if (referenceCases.length) {
      const merged = { ...args.brief, referenceCases, fullMarkdown: formatFullMarkdown({ ...args.brief, referenceCases }) }
      return { result: merged }
    }
    return { result: args.brief, searchNote: '未检索到相似案例，文字 Brief 已可用。' }
  } catch {
    return { result: args.brief, searchNote: '相似案例检索未完成，文字 Brief 已可用。' }
  }
}

/** 兼容旧调用：先文字后检索，检索失败仍返回文字 */
export async function generateViralBrief(args: {
  order: RecruitOrderPickerRow
  platform?: ViralBriefPlatform
  style?: ViralBriefStyle
  extraHint?: string
  onProgress?: (msg: string) => void
}): Promise<ViralBriefResult> {
  const text = await generateViralBriefText(args)
  const { result } = await searchViralBriefReferences({
    order: args.order,
    platform: args.platform,
    style: args.style,
    brief: text,
    onProgress: args.onProgress,
  })
  return result
}

export { STYLE_LABELS, platformLabel, formatFullMarkdown, briefVendorOrder }
