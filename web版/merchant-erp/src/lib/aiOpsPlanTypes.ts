/** AI 运营方案六块结构化结果（对齐腾讯文档子表，执行落到小时） */

export type AiOpsPlanPlatformStrategy = {
  platform: string
  approach: string
  contentTypes: string
  publishFreq: string
  kpi: string
  examples: string
  /** 分平台策略展开详情 */
  detail: string
}

export type AiOpsPlanPhaseDetailItem = {
  day: string
  task: string
  ownerRole: string
  deliverable: string
  /** 怎么做：步骤 / 标准 / 协作方 */
  howTo: string
}

export type AiOpsPlanPhase = {
  phase: string
  dateRange: string
  actions: string
  ownerRole: string
  deliverable: string
  successMetric: string
  detailItems: AiOpsPlanPhaseDetailItem[]
}

export type AiOpsPlanWeeklyAction = {
  week: string
  dateRange: string
  focus: string
  tasks: string
  ownerRole: string
  detail: string
}

export type AiOpsPlanGoalDetail = {
  metric: string
  target: string
  rationale: string
  gmvYuan: number
  orders: number
  aovYuan: number
}

/** 进度日历必选节点类型 */
export type AiOpsPlanMilestoneKind =
  | 'collab_confirm'
  | 'talent_list'
  | 'shoot_start'
  | 'shoot_end'
  | 'merchant_video_confirm'
  | 'video_publish'
  | 'live_confirm'
  | 'live_talent_script'
  | 'live_warmup'
  | 'live_go'
  | 'other'

export const AI_OPS_MILESTONE_KIND_LABELS: Record<AiOpsPlanMilestoneKind, string> = {
  collab_confirm: '确认合作时间',
  talent_list: '运营方达人名单',
  shoot_start: '探店起拍',
  shoot_end: '探店截止',
  merchant_video_confirm: '商家视频确认',
  video_publish: '视频投放发布',
  live_confirm: '直播档期确认',
  live_talent_script: '直播达人/口播/福袋确认',
  live_warmup: '直播预热',
  live_go: '正式开播',
  other: '其它',
}

/** 仅直播场景需要小时级 */
export type AiOpsPlanHourlySlot = {
  date: string
  timeStart: string
  timeEnd: string
  task: string
  ownerRole: string
  location: string
  deliverable: string
  notes: string
  /** live | other；非 live 前端不展示小时 */
  scene: string
}

export type AiOpsPlanBudgetChannel = {
  channel: string
  amountYuan: number
  ratioPct: number
  month: string
  note: string
}

export type AiOpsPlanRoiRow = {
  channel: string
  investYuan: number
  expectedGmvYuan: number
  expectedOrders: number
  roi: number
  paybackDays: number
  note: string
}

export type AiOpsPlanMilestone = {
  date: string
  time: string
  item: string
  dependency: string
  ownerRole: string
  statusHint: string
  kind: AiOpsPlanMilestoneKind
}

export type AiOpsPlanTalentRow = {
  platform: string
  tier: string
  talentType: string
  headcount: number
  unitBudgetYuan: number
  subtotalYuan: number
  contentForm: string
  publishWindow: string
  note: string
}

/** 细致预算分配：短视频分层人数、本地推、直播达人、直播投流等 */
export type AiOpsPlanBudgetLine = {
  category: string
  platform: string
  tier: string
  headcount: number
  unitBudgetYuan: number
  trafficBudgetYuan: number
  subtotalYuan: number
  note: string
}

export type AiOpsPlanCombo = {
  name: string
  items: string
  priceYuan: number
  originYuan: number
  marginHint: string
  platforms: string
  sellingPoint: string
  stockHint: string
}

export type AiOpsPlanResult = {
  opsPlan: {
    background: string
    backgroundDetail: string
    positioning: string
    /** 活动主题/玩法摘要 */
    activities: string
    activitiesDetail: string
    targetAudience: string
    audienceDetail: string
    goals: string[]
    goalsDetail: AiOpsPlanGoalDetail[]
    contentPillars: string[]
    monthlyThemes: string[]
    platformStrategy: AiOpsPlanPlatformStrategy[]
    risks: string[]
  }
  executionPlan: {
    overview: string
    phases: AiOpsPlanPhase[]
    weeklyActions: AiOpsPlanWeeklyAction[]
    /** 仅直播相关小时排期 */
    hourlySchedule: AiOpsPlanHourlySlot[]
  }
  marketingBudget: {
    totalBudget: number
    channels: AiOpsPlanBudgetChannel[]
    assumptions: string
    contingencyPct: number
    roiSummary: string
    roiAnalysis: AiOpsPlanRoiRow[]
  }
  calendar: {
    milestones: AiOpsPlanMilestone[]
  }
  talentBudget: {
    talentRows: AiOpsPlanTalentRow[]
    budgetLines: AiOpsPlanBudgetLine[]
  }
  productBoard: {
    combos: AiOpsPlanCombo[]
  }
}

export type AiOpsPlanGenerateInput = {
  platforms: string[]
  budgetYuan: number
  periodStart: string
  periodEnd: string
  goalsNote?: string
  storeName?: string
  /** 连锁：参与方案的门店名列表 */
  storeNames?: string[]
  /** all=全部门店；selected=勾选门店 */
  storeScope?: 'all' | 'selected'
  /** 服务商洽谈预览（尚未签约客户） */
  prospectPreview?: boolean
  menuSummary?: string
  margins?: { douyin: number; meituan: number; xhs: number }
  industryPath?: string
  competitorSummary?: string
}

/**
 * 本地生活餐饮投放：分平台核销转化率与 ROI 中位区间（行业案例库/平台品类报告中位，非单店假设）。
 * 说明文案须写清来源区间，禁止写「假设转化率」。
 */
export type AiOpsRoiIndustryBench = {
  match: RegExp
  platformLabel: string
  /** 核销/下单转化率 % 下沿 */
  convLow: number
  /** 核销/下单转化率 % 上沿 */
  convHigh: number
  roiMid: number
  paybackDays: number
  aovYuan: number
  evidence: string
}

export const AI_OPS_ROI_INDUSTRY_BENCHES: AiOpsRoiIndustryBench[] = [
  {
    match: /直播/,
    platformLabel: '抖音直播/本地直播',
    convLow: 8,
    convHigh: 15,
    roiMid: 3.6,
    paybackDays: 14,
    aovYuan: 168,
    evidence:
      '本地生活直播间下单→核销转化常见 8%～15%（内容电商/本地生活投放案例库中位），显著高于短视频场',
  },
  {
    match: /本地推|信息流|投流|DOU\+|dou\+/i,
    platformLabel: '抖音本地推/信息流',
    convLow: 1.8,
    convHigh: 3.5,
    roiMid: 2.5,
    paybackDays: 22,
    aovYuan: 128,
    evidence:
      '抖音本地推/信息流到店餐饮类目点击→核销约 1.8%～3.5%（平台本地推品类中位区间），转化低于直播、成本可控',
  },
  {
    match: /小红书|种草|笔记/,
    platformLabel: '小红书',
    convLow: 0.9,
    convHigh: 2.4,
    roiMid: 2.8,
    paybackDays: 25,
    aovYuan: 188,
    evidence:
      '小红书种草笔记到店核销转化约 0.9%～2.4%（种草场低于交易场），客单偏高，综合 ROI 中位约 2.5～3.5',
  },
  {
    match: /美团|点评|大众点评|到店/,
    platformLabel: '美团/大众点评',
    convLow: 5,
    convHigh: 12,
    roiMid: 3.1,
    paybackDays: 16,
    aovYuan: 142,
    evidence:
      '美团/点评搜索与到店场景转化约 5%～12%（意图明确的搜索场），高于内容种草场',
  },
  {
    match: /快手/,
    platformLabel: '快手',
    convLow: 2,
    convHigh: 5,
    roiMid: 2.7,
    paybackDays: 20,
    aovYuan: 118,
    evidence:
      '快手本地生活/短视频团购核销转化约 2%～5%（同城内容场中位），略低于抖音腰部达人带货',
  },
  {
    match: /微信|视频号/,
    platformLabel: '视频号',
    convLow: 1.5,
    convHigh: 4,
    roiMid: 2.4,
    paybackDays: 24,
    aovYuan: 135,
    evidence:
      '视频号本地生活带货核销转化约 1.5%～4%（私域+内容混合场中位），适合老客复购与社群导流',
  },
  {
    match: /抖音|短视频|达人|探店|KOC|KOL/i,
    platformLabel: '抖音短视频达人',
    convLow: 2.5,
    convHigh: 6,
    roiMid: 3.0,
    paybackDays: 18,
    aovYuan: 135,
    evidence:
      '抖音短视频探店/腰部达人团购核销转化约 2.5%～6%（达人带货案例中位），优于纯信息流、低于直播间',
  },
]

const DEFAULT_ROI_BENCH: AiOpsRoiIndustryBench = {
  match: /.*/,
  platformLabel: '本地生活综合',
  convLow: 2,
  convHigh: 5,
  roiMid: 2.6,
  paybackDays: 21,
  aovYuan: 130,
  evidence: '本地生活多平台综合核销转化约 2%～5%（跨平台案例库中位），按保守中位测算',
}

/** 服务商洽谈空白页 / 类目选择：一级商家类目 */
export const AI_OPS_MERCHANT_CATEGORIES: Array<{ id: string; label: string; path: string }> = [
  { id: 'catering', label: '餐饮美食', path: '餐饮 > 正餐/小吃' },
  { id: 'hotpot', label: '火锅烧烤', path: '餐饮 > 火锅烧烤' },
  { id: 'tea', label: '茶饮咖啡', path: '餐饮 > 茶饮咖啡' },
  { id: 'beauty', label: '丽人美业', path: '丽人 > 美发美甲/医美' },
  { id: 'leisure', label: '休闲娱乐', path: '休闲娱乐 > 桌游剧本/KTV' },
  { id: 'fitness', label: '运动健身', path: '运动健身 > 健身房/瑜伽' },
  { id: 'edu', label: '教育培训', path: '教育培训 > 兴趣/早教' },
  { id: 'retail', label: '零售商超', path: '购物 > 商超便利' },
  { id: 'hotel', label: '酒店民宿', path: '酒店旅游 > 民宿客栈' },
  { id: 'parent', label: '亲子乐园', path: '亲子 > 乐园游乐' },
  { id: 'auto', label: '汽车服务', path: '爱车 > 洗车保养' },
  { id: 'pet', label: '宠物服务', path: '生活服务 > 宠物' },
]

type IndustryRoiMod = {
  match: RegExp
  label: string
  /** 相对餐饮基准的转化倍率 */
  convMul: number
  roiMul: number
  aovMul: number
  note: string
}

const INDUSTRY_ROI_MODS: IndustryRoiMod[] = [
  {
    match: /火锅|烧烤/,
    label: '火锅烧烤',
    convMul: 1.05,
    roiMul: 1.05,
    aovMul: 1.25,
    note: '聚餐客单高、周末核销强',
  },
  {
    match: /茶饮|咖啡|奶茶/,
    label: '茶饮咖啡',
    convMul: 1.15,
    roiMul: 1.1,
    aovMul: 0.55,
    note: '客单低但转化与复购快',
  },
  {
    match: /丽人|美发|美甲|医美|美容|美业/,
    label: '丽人美业',
    convMul: 0.85,
    roiMul: 0.92,
    aovMul: 1.55,
    note: '决策周期长、客单高',
  },
  {
    match: /休闲|娱乐|密室|剧本|KTV|网咖/,
    label: '休闲娱乐',
    convMul: 1.05,
    roiMul: 1.05,
    aovMul: 1.15,
    note: '周末场次驱动核销',
  },
  {
    match: /健身|瑜伽|运动/,
    label: '运动健身',
    convMul: 0.8,
    roiMul: 0.9,
    aovMul: 1.8,
    note: '体验课转化中等、卡项客单高',
  },
  {
    match: /教育|培训|早教|兴趣/,
    label: '教育培训',
    convMul: 0.65,
    roiMul: 0.85,
    aovMul: 2.2,
    note: '长决策、高客单',
  },
  {
    match: /零售|商超|便利|数码|购物/,
    label: '零售商超',
    convMul: 0.95,
    roiMul: 0.95,
    aovMul: 0.85,
    note: '到店频次高、客单中低',
  },
  {
    match: /酒店|民宿|旅游/,
    label: '酒店民宿',
    convMul: 0.75,
    roiMul: 0.9,
    aovMul: 2.5,
    note: '预订转化低于堂食、客单高',
  },
  {
    match: /亲子|乐园/,
    label: '亲子乐园',
    convMul: 1.0,
    roiMul: 1.0,
    aovMul: 1.2,
    note: '周末家庭客为主',
  },
  {
    match: /汽车|洗车|保养/,
    label: '汽车服务',
    convMul: 0.7,
    roiMul: 0.88,
    aovMul: 1.3,
    note: '到店服务型、转化偏搜索场',
  },
  {
    match: /宠物/,
    label: '宠物服务',
    convMul: 0.9,
    roiMul: 0.95,
    aovMul: 1.1,
    note: '本地刚需、复购稳定',
  },
  {
    match: /餐饮|美食|正餐|小吃/,
    label: '餐饮美食',
    convMul: 1,
    roiMul: 1,
    aovMul: 1,
    note: '本地生活基准业态',
  },
]

function resolveIndustryRoiMod(industryPath?: string): IndustryRoiMod | null {
  const t = String(industryPath || '').trim()
  if (!t) return null
  for (const m of INDUSTRY_ROI_MODS) {
    if (m.match.test(t)) return m
  }
  return null
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function resolveAiOpsRoiIndustryBench(
  channel: string,
  industryPath?: string,
): AiOpsRoiIndustryBench {
  const t = String(channel || '')
  let base = DEFAULT_ROI_BENCH
  for (const b of AI_OPS_ROI_INDUSTRY_BENCHES) {
    if (b.match.test(t)) {
      base = b
      break
    }
  }
  const mod = resolveIndustryRoiMod(industryPath)
  if (!mod || (mod.convMul === 1 && mod.roiMul === 1 && mod.aovMul === 1)) return base
  return {
    ...base,
    platformLabel: `${base.platformLabel}·${mod.label}`,
    convLow: round1(base.convLow * mod.convMul),
    convHigh: round1(base.convHigh * mod.convMul),
    roiMid: round2(base.roiMid * mod.roiMul),
    aovYuan: Math.round(base.aovYuan * mod.aovMul),
    evidence: `${base.evidence}；业态校正（${mod.label}）：${mod.note}`,
  }
}

export function formatAiOpsRoiEvidenceNote(
  channel: string,
  bench?: AiOpsRoiIndustryBench,
  industryPath?: string,
): string {
  const b = bench || resolveAiOpsRoiIndustryBench(channel, industryPath)
  return `${b.platformLabel}行业中位核销转化 ${b.convLow}%～${b.convHigh}%；${b.evidence}；参考 GMV 投产中位≈${b.roiMid}（周期合计，非日GMV）`
}

/** 活动起止日期间隔（含首尾），最少 1 天 */
export function aiOpsPeriodDays(periodStart?: string, periodEnd?: string): number {
  const a = String(periodStart || '').slice(0, 10)
  const b = String(periodEnd || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return 30
  const t0 = Date.parse(`${a}T00:00:00`)
  const t1 = Date.parse(`${b}T00:00:00`)
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return 30
  return Math.max(1, Math.round((t1 - t0) / 86400000) + 1)
}

export type AiOpsPlatformMargins = { douyin: number; meituan: number; xhs: number }

/** 渠道匹配商家配置的平台毛利率（%）；无配置时用 35 */
export function resolveChannelMarginPct(
  channel: string,
  margins?: AiOpsPlatformMargins | null,
): number {
  const ch = String(channel || '')
  const clamp = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.min(95, Math.max(1, Math.round(n * 10) / 10))
  }
  if (margins) {
    if (/美团|点评|大众点评/.test(ch)) {
      const m = clamp(Number(margins.meituan))
      if (m) return m
    }
    if (/小红书|种草|笔记|RED/i.test(ch)) {
      const m = clamp(Number(margins.xhs))
      if (m) return m
    }
    if (/抖音|本地推|信息流|直播|短视频|达人|探店|DOU\+/i.test(ch)) {
      const m = clamp(Number(margins.douyin))
      if (m) return m
    }
    const vals = [margins.douyin, margins.meituan, margins.xhs]
      .map((x) => clamp(Number(x)))
      .filter((x) => x > 0)
    if (vals.length) {
      return Math.round((vals.reduce((s, x) => s + x, 0) / vals.length) * 10) / 10
    }
  }
  return 35
}

/**
 * 统一投产口径：
 * - expectedGmvYuan = 活动周期总 GMV（非日 GMV）
 * - roi = 毛利 ROI = (GMV × 毛利率) / 投入
 * - paybackDays = 投入 ÷ 日均毛利 = 投入 × 周期天数 ÷ (GMV × 毛利率)
 */
export function computeAiOpsRoiMetrics(opts: {
  investYuan: number
  expectedGmvYuan: number
  marginPct: number
  periodDays: number
}): {
  gmvRoi: number
  marginRoi: number
  grossProfitYuan: number
  paybackDays: number
} {
  const invest = Math.max(0, Number(opts.investYuan) || 0)
  const gmv = Math.max(0, Number(opts.expectedGmvYuan) || 0)
  const marginPct = Math.max(0, Number(opts.marginPct) || 0)
  const days = Math.max(1, Math.round(Number(opts.periodDays) || 30))
  const grossProfitYuan = Math.round((gmv * marginPct) / 100)
  const gmvRoi = invest > 0 ? Math.round((gmv / invest) * 100) / 100 : 0
  const marginRoi = invest > 0 ? Math.round((grossProfitYuan / invest) * 100) / 100 : 0
  let paybackDays = 0
  if (grossProfitYuan > 0 && invest > 0) {
    paybackDays = Math.max(1, Math.ceil((invest * days) / grossProfitYuan))
  }
  return { gmvRoi, marginRoi, grossProfitYuan, paybackDays }
}

/** 按勾选平台 + 商家类目生成「转化率查询表」，供模型测算 ROI（禁止假设转化率） */
export function buildAiOpsRoiLookupForPrompt(platforms: string[], industryPath?: string): string {
  const plats = platforms.length ? platforms : ['抖音', '小红书']
  const lines = plats.map((p) => {
    const b = resolveAiOpsRoiIndustryBench(p, industryPath)
    return `- ${p}：核销转化 ${b.convLow}%～${b.convHigh}% · 参考周期GMV投产中位≈${b.roiMid} · 客单约¥${b.aovYuan}（${b.evidence}）`
  })
  const ind = industryPath?.trim() || '未指定（按本地生活综合）'
  return [
    `【转化率查询结果 · 须据此填写 roiAnalysis，禁止写「假设转化率」】`,
    `商家类目：${ind}`,
    `口径：expectedGmvYuan=活动周期总GMV；roi=毛利ROI=(GMV×品类毛利率)÷投入；paybackDays=投入÷日均毛利`,
    ...lines,
    `- 抖音直播（若方案含直播）：8%～15%（再按业态校正）`,
    `- 抖音本地推：1.8%～3.5%（再按业态校正）`,
    `- 美团/点评搜索场：5%～12%（再按业态校正）`,
  ].join('\n')
}

function looksLikeAssumedConvNote(note: string): boolean {
  return /假设转化|假设.?转化率|假定转化|拍脑袋|随意假设/i.test(note || '')
}

export const AI_OPS_PLAN_TABS = [
  { id: 'ops', label: '运营方案' },
  { id: 'exec', label: '具体执行方案' },
  { id: 'budget', label: '营销预算方案' },
  { id: 'calendar', label: '项目进度日历' },
  { id: 'talent', label: '预算分配明细' },
  { id: 'combos', label: '组品货盘明细' },
] as const

export type AiOpsPlanTabId = (typeof AI_OPS_PLAN_TABS)[number]['id']

function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim()
}

function asNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number.parseFloat(v.replace(/[^\d.-]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return 0
}

function asStrArr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map(asStr).filter(Boolean).slice(0, 40)
}

const MILESTONE_KIND_SET = new Set<string>([
  'collab_confirm',
  'talent_list',
  'shoot_start',
  'shoot_end',
  'merchant_video_confirm',
  'video_publish',
  'live_confirm',
  'live_talent_script',
  'live_warmup',
  'live_go',
  'other',
])

export function normalizeMilestoneKind(raw: unknown, itemText = ''): AiOpsPlanMilestoneKind {
  const k = asStr(raw).toLowerCase().replace(/-/g, '_')
  if (MILESTONE_KIND_SET.has(k)) return k as AiOpsPlanMilestoneKind
  const t = itemText
  if (/确认合作|合作时间|签约确认/.test(t)) return 'collab_confirm'
  if (/达人名单|合作达人|人选确认/.test(t)) return 'talent_list'
  if (/探店起|首次探店|开拍|拍摄启动/.test(t)) return 'shoot_start'
  if (/探店止|探店结束|拍摄截止|成片交付/.test(t)) return 'shoot_end'
  if (/视频确认|成片确认|商家确认/.test(t)) return 'merchant_video_confirm'
  if (/发布|投放|上线短视频|笔记上线/.test(t)) return 'video_publish'
  if (/直播确认|档期确认|直播排期确认/.test(t)) return 'live_confirm'
  if (/口播|福袋|直播达人确认|脚本确认/.test(t)) return 'live_talent_script'
  if (/预热/.test(t)) return 'live_warmup'
  if (/开播|首场直播|正式直播/.test(t)) return 'live_go'
  return 'other'
}

/** 按类目×平台给出短视频高峰发布时间（HH:mm） */
export function resolveAiOpsPublishWindows(
  platform: string,
  industryPath?: string,
): { times: string[]; reason: string } {
  const p = platform || '抖音'
  const path = industryPath || ''
  const isDining = /餐饮|美食|火锅|烧烤|饮品|咖啡|茶饮|小吃|正餐/.test(path)
  const isLeisure = /休闲|娱乐|足疗|按摩|影院|电影|洗浴|美容|美发|丽人|到店/.test(path)
  const peak = isDining || isLeisure
  if (/小红书|种草|笔记/.test(p)) {
    return {
      times: peak ? ['12:00', '20:00'] : ['19:30'],
      reason: peak
        ? '小红书到店类目午间/晚间种草高峰，利于收藏与到店决策'
        : '小红书通用晚高峰曝光窗口',
    }
  }
  if (/美团|点评|大众点评/.test(p)) {
    return {
      times: peak ? ['10:30', '18:00'] : ['12:00', '18:00'],
      reason: '点评/美团搜索与到店决策高峰，利于评价与核销转化',
    }
  }
  if (/快手/.test(p)) {
    return {
      times: peak ? ['12:00', '19:30'] : ['19:30'],
      reason: '快手同城内容晚高峰曝光更集中',
    }
  }
  if (/微信|视频号/.test(p)) {
    return {
      times: ['12:00', '20:30'],
      reason: '视频号私域+晚间刷流窗口，利于转发与复购',
    }
  }
  // 抖音默认
  return {
    times: peak ? ['11:30', '17:30', '19:30'] : ['12:00', '19:30'],
    reason: peak
      ? '抖音到店/餐饮午高峰与下班后刷流峰值，利于团购曝光与核销'
      : '抖音短视频通用午晚高峰窗口',
  }
}

function addDaysIso(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return iso
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + days)
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const da = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

function clampIsoInPeriod(iso: string, start: string, end: string): string {
  if (iso < start) return start
  if (iso > end) return end
  return iso
}

/** 宽松解析模型 JSON → 六块结构（缺字段补空） */
export function normalizeAiOpsPlanResult(raw: unknown): AiOpsPlanResult | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const ops = (o.opsPlan ?? o.ops_plan ?? o['运营方案']) as Record<string, unknown> | undefined
  const exec = (o.executionPlan ?? o.execution_plan ?? o['具体执行方案']) as
    | Record<string, unknown>
    | undefined
  const budget = (o.marketingBudget ?? o.marketing_budget ?? o['营销预算方案']) as
    | Record<string, unknown>
    | undefined
  const cal = (o.calendar ?? o.projectCalendar ?? o['项目进度日历']) as
    | Record<string, unknown>
    | undefined
  const talent = (o.talentBudget ?? o.talent_budget ?? o['预算分配明细']) as
    | Record<string, unknown>
    | undefined
  const board = (o.productBoard ?? o.product_board ?? o['组品货盘']) as
    | Record<string, unknown>
    | undefined

  if (!ops && !exec && !budget) return null

  const platformStrategyRaw = Array.isArray(ops?.platformStrategy)
    ? ops!.platformStrategy
    : Array.isArray(ops?.platform_strategy)
      ? ops!.platform_strategy
      : []
  const phasesRaw = Array.isArray(exec?.phases) ? exec!.phases : []
  const weeklyRaw = Array.isArray(exec?.weeklyActions)
    ? exec!.weeklyActions
    : Array.isArray(exec?.weekly_actions)
      ? exec!.weekly_actions
      : []
  const hourlyRaw = Array.isArray(exec?.hourlySchedule)
    ? exec!.hourlySchedule
    : Array.isArray(exec?.hourly_schedule)
      ? exec!.hourly_schedule
      : Array.isArray(exec?.dailyHourly)
        ? exec!.dailyHourly
        : []
  const channelsRaw = Array.isArray(budget?.channels) ? budget!.channels : []
  const milestonesRaw = Array.isArray(cal?.milestones) ? cal!.milestones : []
  const talentRaw = Array.isArray(talent?.talentRows)
    ? talent!.talentRows
    : Array.isArray(talent?.talent_rows)
      ? talent!.talent_rows
      : []
  const budgetLinesRaw = Array.isArray(talent?.budgetLines)
    ? talent!.budgetLines
    : Array.isArray(talent?.budget_lines)
      ? talent!.budget_lines
      : []
  const roiRaw = Array.isArray(budget?.roiAnalysis)
    ? budget!.roiAnalysis
    : Array.isArray(budget?.roi_analysis)
      ? budget!.roi_analysis
      : []
  const combosRaw = Array.isArray(board?.combos) ? board!.combos : []
  const goalsDetailRaw = Array.isArray(ops?.goalsDetail)
    ? ops!.goalsDetail
    : Array.isArray(ops?.goals_detail)
      ? ops!.goals_detail
      : []

  return {
    opsPlan: {
      background: asStr(ops?.background),
      backgroundDetail: asStr(ops?.backgroundDetail ?? ops?.background_detail),
      positioning: asStr(ops?.positioning),
      activities: asStr(ops?.activities ?? ops?.activity),
      activitiesDetail: asStr(ops?.activitiesDetail ?? ops?.activities_detail),
      targetAudience: asStr(ops?.targetAudience ?? ops?.target_audience),
      audienceDetail: asStr(ops?.audienceDetail ?? ops?.audience_detail),
      goals: asStrArr(ops?.goals),
      goalsDetail: goalsDetailRaw
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((g) => ({
          metric: asStr(g.metric ?? g.name),
          target: asStr(g.target ?? g.value),
          rationale: asStr(g.rationale ?? g.note),
          gmvYuan: asNum(g.gmvYuan ?? g.gmv_yuan ?? g.gmv),
          orders: asNum(g.orders ?? g.expectedOrders),
          aovYuan: asNum(g.aovYuan ?? g.aov_yuan ?? g.aov),
        }))
        .filter((g) => g.metric || g.target)
        .slice(0, 20),
      contentPillars: asStrArr(ops?.contentPillars ?? ops?.content_pillars),
      monthlyThemes: asStrArr(ops?.monthlyThemes ?? ops?.monthly_themes),
      platformStrategy: platformStrategyRaw
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((r) => ({
          platform: asStr(r.platform),
          approach: asStr(r.approach ?? r.playbook),
          contentTypes: asStr(r.contentTypes ?? r.content_types),
          publishFreq: asStr(r.publishFreq ?? r.publish_freq),
          kpi: asStr(r.kpi),
          examples: asStr(r.examples ?? r.contentExamples),
          detail: asStr(r.detail ?? r.strategyDetail),
        }))
        .filter((r) => r.platform || r.approach)
        .slice(0, 12),
      risks: asStrArr(ops?.risks),
    },
    executionPlan: {
      overview: asStr(exec?.overview),
      phases: phasesRaw
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((r) => {
          const detailRaw = Array.isArray(r.detailItems)
            ? r.detailItems
            : Array.isArray(r.detail_items)
              ? r.detail_items
              : Array.isArray(r.dailyTasks)
                ? r.dailyTasks
                : []
          return {
            phase: asStr(r.phase),
            dateRange: asStr(r.dateRange ?? r.date_range),
            actions: asStr(r.actions),
            ownerRole: asStr(r.ownerRole ?? r.owner_role),
            deliverable: asStr(r.deliverable),
            successMetric: asStr(r.successMetric ?? r.success_metric),
            detailItems: detailRaw
              .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
              .map((d) => ({
                day: asStr(d.day ?? d.date),
                task: asStr(d.task ?? d.item ?? d.actions),
                ownerRole: asStr(d.ownerRole ?? d.owner_role),
                deliverable: asStr(d.deliverable),
                howTo: asStr(d.howTo ?? d.how_to ?? d.steps),
              }))
              .filter((d) => d.day || d.task)
              .slice(0, 40),
          }
        })
        .filter((r) => r.phase || r.actions)
        .slice(0, 24),
      weeklyActions: weeklyRaw
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((r) => ({
          week: asStr(r.week),
          dateRange: asStr(r.dateRange ?? r.date_range),
          focus: asStr(r.focus),
          tasks: asStr(r.tasks),
          ownerRole: asStr(r.ownerRole ?? r.owner_role),
          detail: asStr(r.detail ?? r.weekDetail),
        }))
        .filter((r) => r.week || r.focus)
        .slice(0, 24),
      hourlySchedule: hourlyRaw
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((r) => {
          const task = asStr(r.task ?? r.item ?? r.actions)
          const sceneRaw = asStr(r.scene).toLowerCase()
          const isLive =
            sceneRaw === 'live' ||
            sceneRaw === '直播' ||
            /直播/.test(task) ||
            /直播/.test(asStr(r.notes))
          return {
            date: asStr(r.date),
            timeStart: asStr(r.timeStart ?? r.time_start ?? r.start),
            timeEnd: asStr(r.timeEnd ?? r.time_end ?? r.end),
            task,
            ownerRole: asStr(r.ownerRole ?? r.owner_role),
            location: asStr(r.location),
            deliverable: asStr(r.deliverable),
            notes: asStr(r.notes),
            scene: isLive ? 'live' : sceneRaw || 'other',
          }
        })
        .filter((r) => (r.date || r.task) && r.scene === 'live')
        .slice(0, 40),
    },
    marketingBudget: {
      totalBudget: asNum(budget?.totalBudget ?? budget?.total_budget),
      channels: channelsRaw
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((r) => ({
          channel: asStr(r.channel),
          amountYuan: asNum(r.amountYuan ?? r.amount_yuan ?? r.amount),
          ratioPct: asNum(r.ratioPct ?? r.ratio_pct ?? r.ratio),
          month: asStr(r.month),
          note: asStr(r.note),
        }))
        .filter((r) => r.channel)
        .slice(0, 30),
      assumptions: asStr(budget?.assumptions),
      contingencyPct: asNum(budget?.contingencyPct ?? budget?.contingency_pct),
      roiSummary: asStr(budget?.roiSummary ?? budget?.roi_summary),
      roiAnalysis: roiRaw
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((r) => ({
          channel: asStr(r.channel),
          investYuan: asNum(r.investYuan ?? r.invest_yuan),
          expectedGmvYuan: asNum(r.expectedGmvYuan ?? r.expected_gmv_yuan ?? r.gmv),
          expectedOrders: asNum(r.expectedOrders ?? r.expected_orders),
          roi: asNum(r.roi),
          paybackDays: asNum(r.paybackDays ?? r.payback_days),
          note: asStr(r.note),
        }))
        .filter((r) => r.channel)
        .slice(0, 20),
    },
    calendar: {
      milestones: milestonesRaw
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((r) => ({
          date: asStr(r.date),
          time: asStr(r.time),
          item: asStr(r.item ?? r.title),
          dependency: asStr(r.dependency),
          ownerRole: asStr(r.ownerRole ?? r.owner_role),
          statusHint: asStr(r.statusHint ?? r.status_hint),
          kind: normalizeMilestoneKind(r.kind ?? r.type, asStr(r.item ?? r.title)),
        }))
        .filter((r) => r.date || r.item)
        .slice(0, 80),
    },
    talentBudget: {
      talentRows: talentRaw
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((r) => ({
          platform: asStr(r.platform),
          tier: asStr(r.tier),
          talentType: asStr(r.talentType ?? r.talent_type),
          headcount: Math.max(0, Math.round(asNum(r.headcount ?? r.count))),
          unitBudgetYuan: asNum(r.unitBudgetYuan ?? r.unit_budget_yuan),
          subtotalYuan: asNum(r.subtotalYuan ?? r.subtotal_yuan),
          contentForm: asStr(r.contentForm ?? r.content_form),
          publishWindow: asStr(r.publishWindow ?? r.publish_window),
          note: asStr(r.note),
        }))
        .filter((r) => r.platform || r.tier)
        .slice(0, 50),
      budgetLines: budgetLinesRaw
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((r) => ({
          category: asStr(r.category),
          platform: asStr(r.platform),
          tier: asStr(r.tier),
          headcount: Math.max(0, Math.round(asNum(r.headcount))),
          unitBudgetYuan: asNum(r.unitBudgetYuan ?? r.unit_budget_yuan),
          trafficBudgetYuan: asNum(r.trafficBudgetYuan ?? r.traffic_budget_yuan),
          subtotalYuan: asNum(r.subtotalYuan ?? r.subtotal_yuan),
          note: asStr(r.note),
        }))
        .filter((r) => r.category || r.platform)
        .slice(0, 40),
    },
    productBoard: {
      combos: combosRaw
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((r) => ({
          name: asStr(r.name ?? r.productName),
          items: asStr(
            r.items ??
              (Array.isArray(r.comboLines) ? (r.comboLines as unknown[]).map(asStr).join('、') : ''),
          ),
          priceYuan: asNum(r.priceYuan ?? r.suggestedPriceYuan ?? r.price),
          originYuan: asNum(r.originYuan ?? r.origin_yuan),
          marginHint: asStr(r.marginHint ?? r.margin_hint ?? r.marginNote),
          platforms: Array.isArray(r.platforms)
            ? (r.platforms as unknown[]).map(asStr).filter(Boolean).join('/')
            : asStr(r.platforms),
          sellingPoint: asStr(r.sellingPoint ?? r.selling_point),
          stockHint: asStr(r.stockHint ?? r.stock_hint),
        }))
        .filter((r) => r.name)
        .slice(0, 30),
    },
  }
}

export function isAiOpsPlanResultUsable(plan: AiOpsPlanResult): boolean {
  return (
    plan.opsPlan.goals.length > 0 ||
    plan.opsPlan.platformStrategy.length > 0 ||
    plan.executionPlan.phases.length > 0 ||
    plan.executionPlan.hourlySchedule.length > 0 ||
    plan.marketingBudget.channels.length > 0 ||
    plan.calendar.milestones.length > 0 ||
    plan.talentBudget.talentRows.length > 0 ||
    plan.talentBudget.budgetLines.length > 0 ||
    plan.marketingBudget.roiAnalysis.length > 0 ||
    plan.productBoard.combos.length > 0
  )
}

/** 用「勾选平台 × 商家类目」查询转化率区间；GMV=周期合计；ROI/回本按品类毛利重算 */
export function ensureMarketingRoiFallback(
  plan: AiOpsPlanResult,
  opts?: {
    industryPath?: string
    margins?: AiOpsPlatformMargins | null
    periodStart?: string
    periodEnd?: string
  },
): AiOpsPlanResult {
  const industryPath = opts?.industryPath?.trim() || undefined
  const margins = opts?.margins || null
  const periodDays = aiOpsPeriodDays(opts?.periodStart, opts?.periodEnd)
  let roiAnalysis = [...(plan.marketingBudget.roiAnalysis || [])]

  const finalizeRow = (r: {
    channel: string
    investYuan: number
    expectedGmvYuan: number
    expectedOrders: number
    note: string
  }): AiOpsPlanRoiRow => {
    const bench = resolveAiOpsRoiIndustryBench(r.channel, industryPath)
    const marginPct = resolveChannelMarginPct(r.channel, margins)
    let expectedGmvYuan = r.expectedGmvYuan
    let expectedOrders = r.expectedOrders

    const breakEvenGmv =
      r.investYuan > 0 && marginPct > 0
        ? Math.round((r.investYuan / (marginPct / 100)) * 1.2)
        : 0
    const industryGmv = r.investYuan > 0 ? Math.round(r.investYuan * bench.roiMid) : 0
    const floorGmv = Math.max(breakEvenGmv, industryGmv)

    const gmvInvestRatio = r.investYuan > 0 ? expectedGmvYuan / r.investYuan : 0
    const provisional = computeAiOpsRoiMetrics({
      investYuan: r.investYuan,
      expectedGmvYuan: Math.max(0, expectedGmvYuan),
      marginPct,
      periodDays,
    })
    const needRecalc =
      r.investYuan > 0 &&
      (expectedGmvYuan <= 0 ||
        looksLikeAssumedConvNote(r.note) ||
        gmvInvestRatio < 1.5 ||
        gmvInvestRatio > 20 ||
        provisional.marginRoi < 1 ||
        (floorGmv > 0 && expectedGmvYuan < floorGmv))

    if (needRecalc && floorGmv > 0) {
      expectedGmvYuan = floorGmv
      expectedOrders = Math.max(1, Math.round(expectedGmvYuan / bench.aovYuan))
    } else if (expectedOrders <= 0 && expectedGmvYuan > 0) {
      expectedOrders = Math.max(1, Math.round(expectedGmvYuan / bench.aovYuan))
    }

    const m = computeAiOpsRoiMetrics({
      investYuan: r.investYuan,
      expectedGmvYuan,
      marginPct,
      periodDays,
    })
    const evidence = formatAiOpsRoiEvidenceNote(r.channel, bench, industryPath)
    const cleanedNote = String(r.note || '')
      .replace(/回本约\d+天/g, '')
      .replace(/；{2,}/g, '；')
      .replace(/^；|；$/g, '')
      .trim()
    const baseNote =
      !cleanedNote || looksLikeAssumedConvNote(cleanedNote)
        ? evidence
        : /行业中位|核销转化\s*\d/.test(cleanedNote)
          ? cleanedNote
          : `${cleanedNote}；依据：${evidence}`
    const note =
      `${baseNote}；口径：周期合计GMV（非日GMV）¥${expectedGmvYuan.toLocaleString('zh-CN')}` +
      `≈客单¥${bench.aovYuan}×约${expectedOrders}单` +
      `×品类毛利${marginPct}%→预计毛利¥${m.grossProfitYuan.toLocaleString('zh-CN')}` +
      `；毛利ROI=${m.marginRoi}（GMV投产=${m.gmvRoi}；盈亏线×1.2≈¥${breakEvenGmv.toLocaleString('zh-CN')}）` +
      `；回本=投入÷日均毛利≈${m.paybackDays || '—'}天（活动${periodDays}天）`

    return {
      channel: r.channel,
      investYuan: r.investYuan,
      expectedGmvYuan,
      expectedOrders,
      roi: m.marginRoi,
      paybackDays: m.paybackDays,
      note,
    }
  }

  if (roiAnalysis.length < 2) {
    const channels = plan.marketingBudget.channels.length
      ? plan.marketingBudget.channels
      : [
          {
            channel: '综合投放',
            amountYuan: plan.marketingBudget.totalBudget || 0,
            ratioPct: 100,
            month: '',
            note: '',
          },
        ]
    roiAnalysis = channels
      .filter((c) => c.amountYuan > 0)
      .slice(0, 8)
      .map((c) => {
        const bench = resolveAiOpsRoiIndustryBench(c.channel, industryPath)
        const invest = c.amountYuan
        const expectedGmvYuan = Math.round(invest * bench.roiMid)
        const expectedOrders = Math.max(1, Math.round(expectedGmvYuan / bench.aovYuan))
        return finalizeRow({
          channel: c.channel,
          investYuan: invest,
          expectedGmvYuan,
          expectedOrders,
          note: '',
        })
      })
  } else {
    roiAnalysis = roiAnalysis.map((r) =>
      finalizeRow({
        channel: r.channel,
        investYuan: r.investYuan,
        expectedGmvYuan: r.expectedGmvYuan,
        expectedOrders: r.expectedOrders,
        note: r.note,
      }),
    )
  }

  const totalInvest = roiAnalysis.reduce((s, r) => s + r.investYuan, 0)
  const totalGmv = roiAnalysis.reduce((s, r) => s + r.expectedGmvYuan, 0)
  const avgMargin =
    roiAnalysis.length > 0
      ? roiAnalysis.reduce((s, r) => s + resolveChannelMarginPct(r.channel, margins), 0) /
        roiAnalysis.length
      : resolveChannelMarginPct('', margins)
  const totalMetrics = computeAiOpsRoiMetrics({
    investYuan: totalInvest,
    expectedGmvYuan: totalGmv,
    marginPct: avgMargin,
    periodDays,
  })
  const roiSummary =
    `活动周期 ${periodDays} 天内：总投入约 ¥${Math.round(totalInvest).toLocaleString('zh-CN')}，` +
    `周期合计预计 GMV 约 ¥${Math.round(totalGmv).toLocaleString('zh-CN')}（非日 GMV），` +
    `按品类毛利约 ${Math.round(avgMargin * 10) / 10}% 计预计毛利约 ¥${totalMetrics.grossProfitYuan.toLocaleString('zh-CN')}，` +
    `综合毛利 ROI ≈ ${totalMetrics.marginRoi}（GMV 投产 ≈ ${totalMetrics.gmvRoi}），` +
    `综合回本约 ${totalMetrics.paybackDays || '—'} 天。` +
    `分渠道核销转化取行业中位区间；回本=投入÷日均毛利。`

  const assumptions =
    '测算口径：预计GMV=活动周期总产出（非每天）；毛利ROI=(周期GMV×品类毛利率)÷投入；回本天数=投入÷(周期毛利÷活动天数)。核销转化取各平台行业中位区间；实际受货盘、核销率、达人与档期影响，建议按周复盘。'

  return {
    ...plan,
    marketingBudget: {
      ...plan.marketingBudget,
      roiAnalysis,
      roiSummary,
      assumptions,
    },
  }
}

export type AiOpsPlanEnrichOpts = {
  industryPath?: string
  margins?: AiOpsPlatformMargins | null
  periodStart?: string
  periodEnd?: string
  platforms?: string[]
}

/** 将运营目标中的核销 GMV 与 roiAnalysis 对齐（客单×单量） */
export function alignOpsPlanGoalsToRoi(
  plan: AiOpsPlanResult,
  opts?: AiOpsPlanEnrichOpts,
): AiOpsPlanResult {
  const industryPath = opts?.industryPath?.trim() || undefined
  const rows = plan.marketingBudget.roiAnalysis || []
  if (!rows.length) return plan

  const goalsDetail: AiOpsPlanGoalDetail[] = rows.map((r) => {
    const bench = resolveAiOpsRoiIndustryBench(r.channel, industryPath)
    const aov = bench.aovYuan
    const orders =
      r.expectedOrders > 0 ? r.expectedOrders : Math.max(1, Math.round(r.expectedGmvYuan / aov))
    const gmv = r.expectedGmvYuan
    return {
      metric: `${r.channel}核销GMV`,
      target: `≥ ¥${gmv.toLocaleString('zh-CN')}（客单约¥${aov} × 约 ${orders} 单）`,
      rationale:
        `按投入 ¥${r.investYuan.toLocaleString('zh-CN')}、行业GMV投产中位与毛利盈亏线（≥投入÷毛利率×1.2）取高测算；` +
        `禁止目标核销GMV低于投放预算导致商家亏损。毛利ROI≈${r.roi}。`,
      gmvYuan: gmv,
      orders,
      aovYuan: aov,
    }
  })

  const totalGmv = rows.reduce((s, r) => s + r.expectedGmvYuan, 0)
  const totalOrders = rows.reduce((s, r) => s + (r.expectedOrders || 0), 0)
  const avgAov =
    totalOrders > 0
      ? Math.round(totalGmv / totalOrders)
      : resolveAiOpsRoiIndustryBench(rows[0]?.channel || '抖音', industryPath).aovYuan
  goalsDetail.push({
    metric: '活动周期合计核销GMV',
    target: `≥ ¥${Math.round(totalGmv).toLocaleString('zh-CN')}（综合客单约¥${avgAov} × 约 ${totalOrders} 单）`,
    rationale: plan.marketingBudget.roiSummary || '分渠道测算合计；须覆盖投放成本对应的毛利盈亏线。',
    gmvYuan: Math.round(totalGmv),
    orders: totalOrders,
    aovYuan: avgAov,
  })

  const gmvGoalLines = goalsDetail.map((g) => `${g.metric} ${g.target}`)
  const keptGoals = (plan.opsPlan.goals || []).filter(
    (g) => !/核销\s*GMV|GMV\s*[≥>=]|预计\s*GMV|成交额|核销额/i.test(g),
  )
  const goals = [...gmvGoalLines, ...keptGoals].slice(0, 12)

  const nonGmvExisting = (plan.opsPlan.goalsDetail || []).filter(
    (g) => g.gmvYuan <= 0 && !/核销\s*GMV|GMV/i.test(g.metric),
  )

  return {
    ...plan,
    opsPlan: {
      ...plan.opsPlan,
      goals,
      goalsDetail: [...goalsDetail, ...nonGmvExisting].slice(0, 20),
    },
  }
}

const REQUIRED_MILESTONE_KINDS: AiOpsPlanMilestoneKind[] = [
  'collab_confirm',
  'talent_list',
  'shoot_start',
  'shoot_end',
  'merchant_video_confirm',
  'video_publish',
  'live_confirm',
  'live_talent_script',
  'live_warmup',
  'live_go',
]

/** 补齐必选进度节点与类目高峰发布时间 */
export function ensureCalendarMilestones(
  plan: AiOpsPlanResult,
  opts?: AiOpsPlanEnrichOpts,
): AiOpsPlanResult {
  const start = (opts?.periodStart || '').trim()
  const end = (opts?.periodEnd || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return plan
  }
  const industryPath = opts?.industryPath?.trim() || undefined
  const platforms =
    opts?.platforms?.length
      ? opts.platforms
      : plan.opsPlan.platformStrategy.map((p) => p.platform).filter(Boolean)
  const primaryPlat = platforms[0] || '抖音'
  const publishWin = resolveAiOpsPublishWindows(primaryPlat, industryPath)
  const days = Math.max(1, aiOpsPeriodDays(start, end))

  const existing = [...(plan.calendar.milestones || [])].map((m) => ({
    ...m,
    kind: m.kind || normalizeMilestoneKind(m.kind, m.item),
  }))
  const have = new Set<string>(
    existing.map((m) => m.kind).filter((k) => k && k !== 'other'),
  )

  const templates: Array<{
    kind: AiOpsPlanMilestoneKind
    offset: number
    time: string
    item: string
    dependency: string
    ownerRole: string
    statusHint: string
  }> = [
    {
      kind: 'collab_confirm',
      offset: 0,
      time: '11:00',
      item: '确认合作时间与档期（商家×运营方）',
      dependency: '签约/预算确认',
      ownerRole: '运营负责人',
      statusHint: '书面确认探店与直播窗口',
    },
    {
      kind: 'talent_list',
      offset: Math.min(2, days - 1),
      time: '15:00',
      item: '运营方给出达人名单并锁定人选',
      dependency: '确认合作时间',
      ownerRole: '运营/媒介',
      statusHint: '含层级、报价、内容形式',
    },
    {
      kind: 'shoot_start',
      offset: Math.min(3, Math.max(1, Math.floor(days * 0.12))),
      time: '14:00',
      item: '探店拍摄起止：开始日（到店拍摄）',
      dependency: '达人名单确认',
      ownerRole: '达人/拍摄',
      statusHint: '商家备场、出餐样片',
    },
    {
      kind: 'shoot_end',
      offset: Math.min(Math.max(5, Math.floor(days * 0.28)), days - 1),
      time: '18:00',
      item: '探店拍摄起止：结束日（成片交付）',
      dependency: '探店开拍',
      ownerRole: '达人/剪辑',
      statusHint: '交付可审成片',
    },
    {
      kind: 'merchant_video_confirm',
      offset: Math.min(Math.max(6, Math.floor(days * 0.32)), days - 1),
      time: '16:00',
      item: '商家视频确认（口播、字幕、套餐露出）',
      dependency: '成片交付',
      ownerRole: '商家运营',
      statusHint: '书面确认后才可投放',
    },
    {
      kind: 'video_publish',
      offset: Math.min(Math.max(7, Math.floor(days * 0.38)), days - 1),
      time: publishWin.times[0] || '19:30',
      item: `${primaryPlat}视频投放发布（${publishWin.times.join('/')} 高峰窗口；${publishWin.reason}）`,
      dependency: '商家视频确认',
      ownerRole: '达人/运营',
      statusHint: '按类目最大曝光窗口发布',
    },
    {
      kind: 'live_confirm',
      offset: Math.min(Math.max(10, Math.floor(days * 0.55)), days - 1),
      time: '11:00',
      item: '直播档期确认（门店/设备/主播）',
      dependency: '短视频起量复盘',
      ownerRole: '直播运营',
      statusHint: '锁定开播日与时长',
    },
    {
      kind: 'live_talent_script',
      offset: Math.min(Math.max(12, Math.floor(days * 0.62)), days - 1),
      time: '15:00',
      item: '直播达人确认：口播稿、福袋、专属券',
      dependency: '直播档期确认',
      ownerRole: '直播运营/达人',
      statusHint: '口播稿与福袋规则书面确认',
    },
    {
      kind: 'live_warmup',
      offset: Math.min(Math.max(14, Math.floor(days * 0.72)), days - 1),
      time: '12:00',
      item: '直播预热（短视频预告+社群/门店物料）',
      dependency: '口播稿/福袋确认',
      ownerRole: '运营',
      statusHint: '预热至少提前 48 小时',
    },
    {
      kind: 'live_go',
      offset: Math.min(Math.max(16, Math.floor(days * 0.85)), days - 1),
      time: '19:00',
      item: '正式开播带货',
      dependency: '直播预热完成',
      ownerRole: '直播运营',
      statusHint: '场控+投流盯盘',
    },
  ]

  const extras: AiOpsPlanMilestone[] = []
  for (const t of templates) {
    if (have.has(t.kind)) continue
    if (!REQUIRED_MILESTONE_KINDS.includes(t.kind)) continue
    const date = clampIsoInPeriod(addDaysIso(start, t.offset), start, end)
    extras.push({
      date,
      time: t.time,
      item: t.item,
      dependency: t.dependency,
      ownerRole: t.ownerRole,
      statusHint: t.statusHint,
      kind: t.kind,
    })
    have.add(t.kind)
  }

  // 若已有 video_publish 但无具体时间，补上高峰时刻
  const patched = existing.map((m) => {
    if (m.kind === 'video_publish' && !m.time) {
      return {
        ...m,
        time: publishWin.times[0] || '19:30',
        item: m.item.includes('高峰')
          ? m.item
          : `${m.item}（建议 ${publishWin.times.join('/')}；${publishWin.reason}）`,
      }
    }
    return m
  })

  const milestones = [...patched, ...extras]
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .slice(0, 80)

  return {
    ...plan,
    calendar: { milestones },
  }
}

/** 服务端/客户端统一后处理：ROI → 目标对齐 → 日历补全 */
export function enrichAiOpsPlanPostProcess(
  plan: AiOpsPlanResult,
  opts?: AiOpsPlanEnrichOpts,
): AiOpsPlanResult {
  let next = ensureMarketingRoiFallback(plan, opts)
  next = alignOpsPlanGoalsToRoi(next, opts)
  next = ensureCalendarMilestones(next, opts)
  return next
}

export function aiOpsPlanToMarkdown(plan: AiOpsPlanResult, meta?: { title?: string }): string {
  const lines: string[] = []
  if (meta?.title) lines.push(`# ${meta.title}`, '')
  lines.push('## 1. 运营方案', '')
  if (plan.opsPlan.background) lines.push(`**背景：** ${plan.opsPlan.background}`, '')
  if (plan.opsPlan.backgroundDetail) {
    lines.push('**背景详情：**', plan.opsPlan.backgroundDetail, '')
  }
  if (plan.opsPlan.positioning) lines.push(`**定位：** ${plan.opsPlan.positioning}`, '')
  if (plan.opsPlan.activities) lines.push(`**活动：** ${plan.opsPlan.activities}`, '')
  if (plan.opsPlan.activitiesDetail) {
    lines.push('**活动详情：**', plan.opsPlan.activitiesDetail, '')
  }
  if (plan.opsPlan.targetAudience) lines.push(`**人群：** ${plan.opsPlan.targetAudience}`, '')
  if (plan.opsPlan.audienceDetail) {
    lines.push('**人群详情：**', plan.opsPlan.audienceDetail, '')
  }
  if (plan.opsPlan.goals.length) {
    lines.push('**目标：**')
    for (const g of plan.opsPlan.goals) lines.push(`- ${g}`)
    lines.push('')
  }
  if (plan.opsPlan.goalsDetail.length) {
    lines.push('### 目标明细（客单×单量）', '')
    lines.push('| 指标 | 目标 | 客单 | 订单 | GMV | 测算说明 |', '| --- | --- | --- | --- | --- | --- |')
    for (const g of plan.opsPlan.goalsDetail) {
      lines.push(
        `| ${g.metric} | ${g.target} | ${g.aovYuan || '—'} | ${g.orders || '—'} | ${g.gmvYuan || '—'} | ${g.rationale} |`,
      )
    }
    lines.push('')
  }
  if (plan.opsPlan.contentPillars.length) {
    lines.push('**内容支柱：** ' + plan.opsPlan.contentPillars.join(' / '), '')
  }
  if (plan.opsPlan.monthlyThemes.length) {
    lines.push('**月度主题：** ' + plan.opsPlan.monthlyThemes.join(' / '), '')
  }
  if (plan.opsPlan.platformStrategy.length) {
    lines.push('| 平台 | 打法 | 内容形态 | 频次 | KPI | 示例 |', '| --- | --- | --- | --- | --- | --- |')
    for (const r of plan.opsPlan.platformStrategy) {
      lines.push(
        `| ${r.platform} | ${r.approach} | ${r.contentTypes} | ${r.publishFreq} | ${r.kpi} | ${r.examples} |`,
      )
      if (r.detail) lines.push(`- **${r.platform} 策略详情：** ${r.detail}`)
    }
    lines.push('')
  }
  if (plan.opsPlan.risks.length) {
    lines.push('**风险：**')
    for (const r of plan.opsPlan.risks) lines.push(`- ${r}`)
    lines.push('')
  }

  lines.push('## 2. 具体执行方案', '')
  if (plan.executionPlan.overview) lines.push(plan.executionPlan.overview, '')
  if (plan.executionPlan.phases.length) {
    lines.push('| 阶段 | 日期 | 动作 | 角色 | 产出 | 成功指标 |', '| --- | --- | --- | --- | --- | --- |')
    for (const r of plan.executionPlan.phases) {
      lines.push(
        `| ${r.phase} | ${r.dateRange} | ${r.actions} | ${r.ownerRole} | ${r.deliverable} | ${r.successMetric} |`,
      )
      if (r.detailItems?.length) {
        lines.push(`#### ${r.phase} 日任务`)
        lines.push('| 日期 | 任务 | 怎么做 | 角色 | 产出 |', '| --- | --- | --- | --- | --- |')
        for (const d of r.detailItems) {
          lines.push(
            `| ${d.day} | ${d.task} | ${d.howTo || '—'} | ${d.ownerRole} | ${d.deliverable} |`,
          )
        }
        lines.push('')
      }
    }
    lines.push('')
  }
  if (plan.executionPlan.weeklyActions.length) {
    lines.push('| 周次 | 日期 | 重点 | 任务 | 角色 |', '| --- | --- | --- | --- | --- |')
    for (const r of plan.executionPlan.weeklyActions) {
      lines.push(`| ${r.week} | ${r.dateRange} | ${r.focus} | ${r.tasks} | ${r.ownerRole} |`)
      if (r.detail) lines.push(`- **${r.week} 详情：** ${r.detail}`)
    }
    lines.push('')
  }
  if (plan.executionPlan.hourlySchedule.length) {
    lines.push('### 直播小时级排期', '')
    lines.push(
      '| 日期 | 开始 | 结束 | 任务 | 角色 | 地点 | 产出 | 备注 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
    )
    for (const r of plan.executionPlan.hourlySchedule) {
      lines.push(
        `| ${r.date} | ${r.timeStart} | ${r.timeEnd} | ${r.task} | ${r.ownerRole} | ${r.location} | ${r.deliverable} | ${r.notes} |`,
      )
    }
    lines.push('')
  }

  lines.push('## 3. 营销预算方案', '')
  lines.push(`**总预算：** ${plan.marketingBudget.totalBudget} 元`, '')
  if (plan.marketingBudget.contingencyPct) {
    lines.push(`**预备金占比：** ${plan.marketingBudget.contingencyPct}%`, '')
  }
  if (plan.marketingBudget.channels.length) {
    lines.push('| 渠道 | 月份 | 金额 | 占比% | 说明 |', '| --- | --- | --- | --- | --- |')
    for (const r of plan.marketingBudget.channels) {
      lines.push(`| ${r.channel} | ${r.month} | ${r.amountYuan} | ${r.ratioPct} | ${r.note} |`)
    }
    lines.push('')
  }
  if (plan.marketingBudget.roiSummary) {
    lines.push(`**ROI 总述：** ${plan.marketingBudget.roiSummary}`, '')
  }
  if (plan.marketingBudget.roiAnalysis.length) {
    lines.push('### ROI 预计投产', '')
    lines.push(
      '| 渠道 | 投入 | 周期预计GMV | 预计订单 | 毛利ROI | 回本天数 | 说明 |',
      '| --- | --- | --- | --- | --- | --- | --- |',
    )
    for (const r of plan.marketingBudget.roiAnalysis) {
      lines.push(
        `| ${r.channel} | ${r.investYuan} | ${r.expectedGmvYuan} | ${r.expectedOrders} | ${r.roi} | ${r.paybackDays} | ${r.note} |`,
      )
    }
    lines.push('')
  }
  if (plan.marketingBudget.assumptions) {
    lines.push(`**假设：** ${plan.marketingBudget.assumptions}`, '')
  }

  lines.push('## 4. 项目进度日历', '')
  if (plan.calendar.milestones.length) {
    lines.push(
      '| 日期 | 时间 | 类型 | 事项 | 依赖 | 角色 | 状态建议 |',
      '| --- | --- | --- | --- | --- | --- | --- |',
    )
    for (const r of plan.calendar.milestones) {
      const kindLabel = AI_OPS_MILESTONE_KIND_LABELS[r.kind] || r.kind || '其它'
      lines.push(
        `| ${r.date} | ${r.time} | ${kindLabel} | ${r.item} | ${r.dependency} | ${r.ownerRole} | ${r.statusHint} |`,
      )
    }
    lines.push('')
  }

  lines.push('## 5. 预算分配明细', '')
  if (plan.talentBudget.budgetLines.length) {
    lines.push(
      '| 类别 | 平台 | 层级 | 人数 | 单场/人 | 投流预算 | 小计 | 备注 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
    )
    for (const r of plan.talentBudget.budgetLines) {
      lines.push(
        `| ${r.category} | ${r.platform} | ${r.tier} | ${r.headcount} | ${r.unitBudgetYuan} | ${r.trafficBudgetYuan} | ${r.subtotalYuan} | ${r.note} |`,
      )
    }
    lines.push('')
  }
  if (plan.talentBudget.talentRows.length) {
    lines.push(
      '| 平台 | 层级 | 类型 | 人数 | 单场 | 小计 | 内容形态 | 发布窗口 | 备注 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    )
    for (const r of plan.talentBudget.talentRows) {
      lines.push(
        `| ${r.platform} | ${r.tier} | ${r.talentType} | ${r.headcount} | ${r.unitBudgetYuan} | ${r.subtotalYuan} | ${r.contentForm} | ${r.publishWindow} | ${r.note} |`,
      )
    }
    lines.push('')
  }

  lines.push('## 6. 组品货盘明细', '')
  if (plan.productBoard.combos.length) {
    lines.push(
      '| 套餐 | 包含 | 售价 | 原价 | 毛利 | 平台 | 卖点 | 库存提示 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
    )
    for (const r of plan.productBoard.combos) {
      lines.push(
        `| ${r.name} | ${r.items} | ${r.priceYuan} | ${r.originYuan} | ${r.marginHint} | ${r.platforms} | ${r.sellingPoint} | ${r.stockHint} |`,
      )
    }
    lines.push('')
  }
  return lines.join('\n')
}
