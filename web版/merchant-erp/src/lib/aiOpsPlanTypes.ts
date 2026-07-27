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

/** 星选达人库分层摘要（服务端注入，供达人预算页展示） */
export type AiOpsPlanTalentLibraryInsight = {
  sourceLabel: string
  citySource: string
  filterCity: string
  platform: string
  /** 头部：销售等级 5 级及以上 */
  headCount: number
  /** 腰尾部：销售等级 3–4 级 */
  midTailCount: number
  headSamples: string[]
  midTailSamples: string[]
  tierAvgSummary: string
  matchedEntries: number
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

/** 标准版=六表；简易版=图文短方案（中小商家/个人） */
export type AiOpsPlanEdition = 'simple' | 'standard'

export type AiOpsPlanSimpleHero = {
  headline: string
  summary: string
  storeHint: string
  periodHint: string
  budgetHint: string
}

/** 最后一级明细：标签 + 写满的具体内容（禁止只有「列项目」这类空壳标题） */
export type AiOpsPlanSimpleAction = {
  label: string
  detail: string
}

/** 点击卡片后展示的细流程（阶段 + 最后一级明细） */
export type AiOpsPlanSimpleFlowItem = {
  title: string
  /** 该阶段说明（必填，白话 1～3 句） */
  body: string
  /** 最后一级明细 3～6 条：每条必须有可落地的具体内容 */
  actions: AiOpsPlanSimpleAction[]
}

export type AiOpsPlanSimpleStep = {
  title: string
  body: string
  tip: string
  detailFlow: AiOpsPlanSimpleFlowItem[]
  detailNote: string
}

export type AiOpsPlanSimplePlatform = {
  platform: string
  how: string
  detailFlow: AiOpsPlanSimpleFlowItem[]
  detailNote: string
}

export type AiOpsPlanSimpleCombo = {
  name: string
  sellingPoint: string
  priceHint: string
  /** 套餐包含（详情用） */
  items: string
  detailFlow: AiOpsPlanSimpleFlowItem[]
  detailNote: string
}

export type AiOpsPlanSimpleCheckItem = {
  text: string
  detailFlow: AiOpsPlanSimpleFlowItem[]
  detailNote: string
}

/** 简易版瘦 schema：封面 + 步骤 + 平台 + 货盘 + 清单 */
export type AiOpsPlanSimplePlan = {
  hero: AiOpsPlanSimpleHero
  steps: AiOpsPlanSimpleStep[]
  platforms: AiOpsPlanSimplePlatform[]
  combos: AiOpsPlanSimpleCombo[]
  checklist: AiOpsPlanSimpleCheckItem[]
}

export type AiOpsPlanResult = {
  /** 缺省视为标准版（兼容旧历史/旧客户端） */
  planEdition?: AiOpsPlanEdition
  /** 简易版内容；标准版可为空 */
  simplePlan?: AiOpsPlanSimplePlan
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
    /** 服务端注入：星选达人库头部(5+) / 腰尾(3-4) 分层摘要 */
    libraryInsight?: AiOpsPlanTalentLibraryInsight
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
  /**
   * 门店所在城市（AI 抓取地址推断）。达人方案写死须按此城从达人库取数；
   * 无同城数据时服务端回退全国本地生活达人。
   */
  city?: string
  /** 服务商洽谈预览（尚未签约客户） */
  prospectPreview?: boolean
  menuSummary?: string
  margins?: { douyin: number; meituan: number; xhs: number }
  industryPath?: string
  competitorSummary?: string
  /**
   * simple=简易图文版；standard=标准六表。
   * 服务端缺省按 standard（兼容旧客户端）；商家 UI 默认传 simple。
   */
  planEdition?: AiOpsPlanEdition
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

function emptyAiOpsPlanStandardBlocks(): AiOpsPlanResult {
  return {
    planEdition: 'standard',
    opsPlan: {
      background: '',
      backgroundDetail: '',
      positioning: '',
      activities: '',
      activitiesDetail: '',
      targetAudience: '',
      audienceDetail: '',
      goals: [],
      goalsDetail: [],
      contentPillars: [],
      monthlyThemes: [],
      platformStrategy: [],
      risks: [],
    },
    executionPlan: { overview: '', phases: [], weeklyActions: [], hourlySchedule: [] },
    marketingBudget: {
      totalBudget: 0,
      channels: [],
      assumptions: '',
      contingencyPct: 0,
      roiSummary: '',
      roiAnalysis: [],
    },
    calendar: { milestones: [] },
    talentBudget: { talentRows: [], budgetLines: [] },
    productBoard: { combos: [] },
  }
}

export function isAiOpsPlanSimpleEdition(plan: AiOpsPlanResult | null | undefined): boolean {
  if (!plan) return false
  return plan.planEdition === 'simple' || !!plan.simplePlan
}

function parseSimpleActions(raw: unknown): AiOpsPlanSimpleAction[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((x, i) => {
      if (typeof x === 'string') {
        const s = asStr(x)
        if (!s) return null
        const m = s.match(/^(.{1,24}?)[：:]\s*(.+)$/)
        if (m) return { label: m[1]!.trim(), detail: m[2]!.trim() }
        // 纯短标题（如「列包含项目」）→ detail 留空，后续强制补全
        if (s.length <= 14 && !/[，。；]/.test(s)) return { label: s, detail: '' }
        return { label: `明细${i + 1}`, detail: s }
      }
      if (!x || typeof x !== 'object') return null
      const r = x as Record<string, unknown>
      const label = asStr(r.label ?? r.title ?? r.name ?? r.item) || `明细${i + 1}`
      const detail = asStr(r.detail ?? r.body ?? r.text ?? r.content ?? r.desc ?? r.description)
      if (!label && !detail) return null
      return { label, detail }
    })
    .filter((x): x is AiOpsPlanSimpleAction => !!x)
    .slice(0, 8)
}

function parseSimpleFlowItems(raw: unknown): AiOpsPlanSimpleFlowItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((x, i) => {
      if (typeof x === 'string') {
        const t = asStr(x)
        return t ? { title: `第${i + 1}步`, body: t, actions: [] } : null
      }
      if (!x || typeof x !== 'object') return null
      const r = x as Record<string, unknown>
      const title = asStr(r.title ?? r.name ?? r.step) || `第${i + 1}步`
      const body = asStr(r.body ?? r.desc ?? r.description ?? r.how ?? r.content)
      const actions = parseSimpleActions(
        r.actions ?? r.todos ?? r.subSteps ?? r.sub_steps ?? r.details ?? r.checklist,
      )
      if (!body && !actions.length && !asStr(r.title ?? r.name)) return null
      return { title, body, actions }
    })
    .filter((x): x is AiOpsPlanSimpleFlowItem => !!x)
    .slice(0, 8)
}

type SimpleFillCtx = {
  topic: string
  summary: string
  tip?: string
  items?: string
  priceHint?: string
  sellingPoint?: string
  platform?: string
}

function isThinAction(a: AiOpsPlanSimpleAction): boolean {
  const d = asStr(a.detail)
  const l = asStr(a.label)
  if (!d) return true
  if (d === '…' || d === '...') return true
  if (d.length < 18) return true
  if (d === l) return true
  // 仍是动词工作流：列xxx / 定xxx / 写xxx，后面没有实质内容
  if (/^(列|定|写|算|传|设|拍|剪|挂|记|核|问|扫|处理)/.test(d) && d.length < 22) return true
  return false
}

function extractIncludedItems(ctx: SimpleFillCtx): string {
  const fromItems = asStr(ctx.items)
  if (fromItems) return fromItems
  const m = asStr(ctx.summary).match(/包含[：:]\s*([^。；\n]+)/)
  if (m?.[1]) return m[1].trim()
  if (/代金券/.test(ctx.topic + ctx.summary)) {
    return `${ctx.topic.replace(/·.*$/, '') || '门店代金券'}（面额以售价为准，到店抵扣）`
  }
  return `${ctx.topic}核心项目（按店内实际可核销项目填写，建议 2～4 项组合）`
}

/** 生成写满具体内容的默认明细（非工作流空壳） */
function buildConcreteDefaults(stage: string, ctx: SimpleFillCtx): {
  body: string
  actions: AiOpsPlanSimpleAction[]
} | null {
  const topic = ctx.topic || '本事项'
  const summary = ctx.summary || ''
  const tip = ctx.tip || ''
  const price = ctx.priceHint || '按店内测算填写'
  const sell = ctx.sellingPoint || summary.slice(0, 48) || `${topic}性价比高、适合到店体验`
  const included = extractIncludedItems(ctx)
  const plat = ctx.platform || '平台'

  const table: Record<string, { body: string; actions: AiOpsPlanSimpleAction[] }> = {
    组品: {
      body: `把「${topic}」定成可上架的完整商品：项目清单、售价规则、卖点文案都要写死，店员按此核销。`,
      actions: [
        {
          label: '包含项目明细',
          detail: `套餐「${topic}」建议包含：${included}。上架时逐项录入后台；核销时按清单勾选，未包含项目需另付费并口头说清。`,
        },
        {
          label: '售价与使用规则',
          detail: `建议售价 ${price}；可另标「门市价」作对比（高出约 20%～40%）。规则建议：活动期内有效；是否预约（建议提前 1 天）；周末/节假日是否通用；是否可转赠/拆分；差价怎么补。以上条文案必须与商品详情页一字不差。`,
        },
        {
          label: '卖点文案（可直接贴）',
          detail: `主卖点：${sell}。副句示例：「适合约会/节日到店，一次体验多个项目，比单点更划算」。禁止夸大「全市最低」等无法证实的表述。`,
        },
        {
          label: '成本与毛利自检',
          detail: `按项目估算成本（人工时长+耗材+赠品），售价减去成本后毛利是否可接受；赠品成本建议控制在售价 5%～10% 内。若算下来亏本，先砍赠品或减项目时长，再上架。`,
        },
      ],
    },
    上架: {
      body: `把「${topic}」上到各勾选平台：主图、标题、详情、门店与库存一次设对，买家视角能买到。`,
      actions: [
        {
          label: '主图与详情图',
          detail: `主图：竖版，含套餐名「${topic}」+ 价格「${price}」+ 1 张双人/到店氛围图。详情图建议 3～5 张：项目实拍、包含清单、使用规则、到店路线或门头。`,
        },
        {
          label: '标题与商品描述',
          detail: `标题示例：「${topic}｜${price}｜${included.split(/[、，,/]/)[0] || '到店套餐'}」。描述必须写清：包含 ${included}；卖点 ${sell}；规则（有效期/预约/节假日）。`,
        },
        {
          label: '门店·库存·可售时间',
          detail: `勾选实际可核销门店；库存先给可消化量（如 30～100，按店量调整）；可售时间对齐活动周期；售罄勿超卖。保存后用手机买家号预览下单页。`,
        },
        {
          label: '上架后自检清单',
          detail: `核对：价格=${price}；包含项目与宣传一致；规则无歧义；挂链商品就是本套餐。有一项不对就先下架改完再开卖。`,
        },
      ],
    },
    核销话术: {
      body: `店员按统一口径接待「${topic}」核销，避免每人说法不一样引发纠纷。`,
      actions: [
        {
          label: '开场话术（原句）',
          detail: `「欢迎光临～请问有团购/套餐码吗？我们这期主推「${topic}」，包含 ${included}。」`,
        },
        {
          label: '核销确认话术（原句）',
          detail: `扫码后说：「帮您核销「${topic}」，包含 ${included}，售价 ${price}。请问还需要加项吗？加项按门市价。」确认客人点头后再点核销。`,
        },
        {
          label: '异常处理话术（原句）',
          detail: `券过期/门店不对/项目不符时：「不好意思，这张券适用于××条件，您这张是××情况。我可以帮您看看改约/补差价/换同等价位项目，您看哪种方便？」禁止指责客人。`,
        },
        {
          label: '离店加微/复购',
          detail: `体验结束可以说：「方便的话加个店员微信，下次节日套餐/会员价第一时间告诉您。」不强迫；禁止虚假「关注必送礼」。`,
        },
      ],
    },
    准备: {
      body: `为「${topic}」备齐：卖点句、规则条文、素材清单，后面写文案和上架不返工。`,
      actions: [
        {
          label: '主卖点（可直接用）',
          detail: summary
            ? `对外主句：${summary.slice(0, 80)}。再补一句行动号召：「今天拍/今天上架/今天就能挂链卖」。`
            : `对外主句：围绕「${topic}」突出优惠与到店体验，一句话说清「谁适合买、买了得什么」。`,
        },
        {
          label: '使用规则条文',
          detail: `写进商品页与海报的条文建议：①适用门店 ②有效期（对齐活动周期）③是否预约 ④节假日是否可用 ⑤可否转赠/拆分 ⑥差价规则。${tip ? `额外注意：${tip}` : ''}`,
        },
        {
          label: '素材拍摄清单',
          detail: `至少准备：门头 1 张、核心项目实拍 2～3 张、价格/券面特写 1 张、成品封面（可后期加字：套餐名+${price !== '按店内测算填写' ? price : '优惠价'}）。勿用与店无关的网图冒充。`,
        },
        {
          label: '违禁与口径',
          detail: `禁止：虚假「全市第一/医院级/百分百有效」；对比价格需真实；医疗功效类承诺一律不写。`,
        },
      ],
    },
    执行: {
      body: `动手落地「${topic}」：文案、后台商品、素材打包一次做完。`,
      actions: [
        {
          label: '标题+正文（可直接改）',
          detail: `标题：本地+「${topic}」+优惠点。正文结构：痛点 1 句 → 包含什么 → 怎么用 → 何时到店。可嵌入：${sell}`,
        },
        {
          label: '后台操作路径',
          detail: `打开商家后台 → 创建/编辑团购或套餐 → 填名称「${topic}」→ 录入包含项目与规则 → 上传主图 → 保存草稿 → 手机预览。`,
        },
        {
          label: '预览核对表',
          detail: `手机预览检查：价格、包含项目、有效期、门店是否与文案一致；链接能否打开；图是否糊。`,
        },
        {
          label: '交付给发布',
          detail: `把「成稿文案 + 封面图 + 商品链接/ID」发到发布群或自己待发文件夹，标注建议发布时间（晚高峰）。`,
        },
      ],
    },
    验收: {
      body: `「${topic}」对外前最后验收：规则、素材、挂链、话术四项过关才算完成。`,
      actions: [
        {
          label: '价格与规则一致性',
          detail: `商品页、海报、短视频字幕三处价格与规则必须一致；发现不一致立刻改。`,
        },
        {
          label: '链接可用性',
          detail: `用买家账号点开挂链，能看到「${topic}」且可下单/领券；失败则先别发内容。`,
        },
        {
          label: '店员抽问',
          detail: `随机问一名店员：包含什么、怎么核销、过期怎么办；答不上来就先培训再放量。`,
        },
        {
          label: '完成打勾',
          detail: `以上三项都过 → 在落地清单勾选「${topic}」→ 进入平台发布或投放。`,
        },
      ],
    },
    选题: {
      body: `为 ${plat} 定一条今天就能拍的「${topic}」内容，角度具体到镜头与文案。`,
      actions: [
        {
          label: '内容角度（写死）',
          detail: summary
            ? `今天拍：${summary}。核心信息只讲一件事，不要又讲套餐又讲品牌故事。`
            : `今天拍：到店体验「${topic}」+ 价格/包含亮点，真实画面为主。`,
        },
        {
          label: '开头 3 秒钩子（原句）',
          detail: `口播/字幕任选：「情侣/节日到店就选这个」「${price !== '按店内测算填写' ? price + '搞定' : '一套价格'}：${included.split(/[、，,/]/).slice(0, 2).join('＋') || topic}」。`,
        },
        {
          label: '分镜清单',
          detail: `①门头 ②进店/更衣或接待 ③核心项目特写 2 镜 ④价格牌/套餐卡 ⑤开心离店或核销微笑。每镜 2～4 秒。`,
        },
        {
          label: '发布时间',
          detail: `${plat} 建议 18:00～21:00 发；避开凌晨。发前确认挂链商品已是「${topic}」。`,
        },
      ],
    },
    '拍摄/剪辑': {
      body: `按选题实拍并剪成 15～30 秒，字幕写清「${topic}」优惠与包含。`,
      actions: [
        {
          label: '实拍要求',
          detail: `竖屏；光线够；突出 ${included.split(/[、，,/]/).slice(0, 2).join('、') || '核心项目'}；禁止摆拍假消费单据。`,
        },
        {
          label: '字幕文案（可直接贴）',
          detail: `「${topic}｜${price}｜含 ${included}」。片中出现价格时停留 ≥1 秒。`,
        },
        {
          label: '剪辑结构',
          detail: `0–3 秒钩子 → 4–20 秒体验 → 21–28 秒价格/包含 → 结尾「点击下方团购/小黄车」。BGM 轻快勿盖过人声。`,
        },
        {
          label: '导出前检查',
          detail: `无夸大医疗功效；无人脸未授权特写纠纷；片尾引导与真实挂链一致。`,
        },
      ],
    },
    拍摄: {
      body: `实拍「${topic}」真实到店画面，给剪辑留够素材。`,
      actions: [
        {
          label: '必拍镜头',
          detail: `门头、核心项目、${included}相关画面、价格/套餐展示各至少 1 镜。`,
        },
        {
          label: '口播一句（原句）',
          detail: `「我们这期「${topic}」，${sell}，欢迎来体验。」`,
        },
      ],
    },
    剪辑: {
      body: `剪出可发布成片，前 3 秒出优惠，片尾引导挂链。`,
      actions: [
        {
          label: '成片结构',
          detail: `钩子→体验→「${topic} ${price}」→行动引导；总长 15～30 秒。`,
        },
        {
          label: '大字字幕',
          detail: `至少出现一次：套餐名、价格、包含摘要。`,
        },
      ],
    },
    发布挂链: {
      body: `在 ${plat} 发布并挂上「${topic}」，用户一点就能买。`,
      actions: [
        {
          label: '标题（可直接用）',
          detail: `「本地｜${topic}｜${price}｜${included.split(/[、，,/]/)[0] || '到店套餐'}」`,
        },
        {
          label: '正文（可直接改）',
          detail: `${sell}\n包含：${included}\n怎么用：到店出示团购/套餐码核销。\n#本地生活 #${plat}`,
        },
        {
          label: '挂链核对',
          detail: `小黄车/组件必须指向「${topic}」本商品，价格显示为 ${price}；发前自己点开测一次。`,
        },
        {
          label: '发布时间与置顶评',
          detail: `18:00～21:00 发布；置顶评论：「有问题评论区问，核销规则见商品页」。`,
        },
      ],
    },
    发布: {
      body: `按时发布「${topic}」内容并完成挂链核验。`,
      actions: [
        {
          label: '发布前 30 秒检查',
          detail: `标题、封面、挂链、价格四处一致后再点发布。`,
        },
        {
          label: '话题标签',
          detail: `加 3～5 个本地/品类话题，勿堆砌无关热搜。`,
        },
      ],
    },
    复盘: {
      body: `看「${topic}」这条内容数据，只加码有效打法。`,
      actions: [
        {
          label: '记录指标',
          detail: `记下：播放、完播、点赞、评论、挂链点击、核销（能看到的都记）。标注发布时段。`,
        },
        {
          label: '有效钩子沉淀',
          detail: `若前 3 秒留人好，把钩子原句复用到下一条；若评论都在问规则，说明商品页规则写不清，先改详情再投。`,
        },
        {
          label: '无效则止损',
          detail: `播放差且无转化：停更同脚本，改卖点角度或换套餐主推，勿同一条连发。`,
        },
      ],
    },
    做什么: {
      body: `今天把「${topic}」做完，并留下可检查的结果（文案/截图/链接）。`,
      actions: [
        {
          label: '今日交付物',
          detail: summary
            ? `完成：${summary}。输出物建议：成稿文案 1 份 + 素材/截图 +（如有）商品链接。`
            : `完成与「${topic}」直接相关的文案/上架/素材其中至少一项，并保存结果。`,
        },
        {
          label: '操作顺序',
          detail: `①确认规则与包含 ②写出可对外文案 ③在后台或文件夹落地 ④自检后打勾。${tip ? `注意：${tip}` : ''}`,
        },
        {
          label: '负责人与时限',
          detail: `今天内完成；若连锁多店，先做 1 家样板店再复制。`,
        },
      ],
    },
    完成标准: {
      body: `「${topic}」达到下列标准才算完成，避免只做了流程标题。`,
      actions: [
        {
          label: '内容标准',
          detail: `对外可见的文案/商品页已写清：叫什么、含什么、多少钱、怎么用；无「待定/稍后补充」。`,
        },
        {
          label: '一致性标准',
          detail: `海报、短视频、商品页三处关键信息一致；${tip ? `并满足：${tip}` : '无虚假宣传。'}`,
        },
        {
          label: '可执行标准',
          detail: `店员或发布人拿着材料能直接干活（能上架/能拍/能核销），不需要再问「到底包含啥」。`,
        },
      ],
    },
  }

  const key = Object.keys(table).find((k) => stage === k || stage.includes(k))
  return key ? table[key]! : null
}

function mergeActionsWithDefaults(
  incoming: AiOpsPlanSimpleAction[],
  defaults: AiOpsPlanSimpleAction[],
): AiOpsPlanSimpleAction[] {
  if (!defaults.length) {
    return incoming
      .map((a) => ({
        label: a.label || '明细',
        detail: isThinAction(a)
          ? `${a.label || a.detail}：请按方案上下文写清具体项目、价格、文案原文，勿只留步骤名。`
          : a.detail,
      }))
      .slice(0, 8)
  }
  // 默认明细优先保证「写满」；若模型某条 detail 已够厚则保留模型版
  const richIncoming = incoming.filter((a) => !isThinAction(a))
  if (richIncoming.length >= defaults.length) return richIncoming.slice(0, 8)
  if (!incoming.length) return defaults
  // 按顺序：薄的用默认同序替换，厚的保留
  const out: AiOpsPlanSimpleAction[] = []
  const n = Math.max(defaults.length, incoming.length)
  for (let i = 0; i < n && out.length < 8; i++) {
    const d = defaults[i]
    const a = incoming[i]
    if (a && !isThinAction(a)) out.push(a)
    else if (d) out.push(d)
    else if (a)
      out.push({
        label: a.label,
        detail: `${a.label}：结合当前套餐/事项写清具体内容（项目、价格、原文话术），不要只写步骤名。`,
      })
  }
  return out.slice(0, 8)
}

/** 按阶段标题 + 上下文补全 body/actions 到「写满的明细」 */
function fillSimpleFlowItem(
  item: AiOpsPlanSimpleFlowItem,
  ctx: SimpleFillCtx,
): AiOpsPlanSimpleFlowItem {
  const topic = ctx.topic || '本事项'
  const summary = ctx.summary || ''
  const tip = ctx.tip || ''
  const t = item.title || '步骤'
  let body = item.body
  const concrete = buildConcreteDefaults(t, ctx)

  if ((!body || body === '…' || body === '...') && concrete) body = concrete.body
  if (!body || body === '…' || body === '...') {
    body = summary
      ? `围绕「${topic}」把下面明细逐条写清并执行：${summary}`
      : `把「${topic}」拆成可执行明细，每条都要有具体内容（项目/价格/原文），不要只写步骤名。`
  }

  const defaultActions =
    concrete?.actions ||
    ([
      {
        label: '交付内容',
        detail: `针对「${topic}」输出可直接使用的结果：${summary || '文案原文 + 规则条文 + 素材说明'}。`,
      },
      {
        label: '操作说明',
        detail: `在商家后台或本地文件夹落地「${topic}」，保存截图/链接；${tip ? `注意 ${tip}。` : '完成后自检信息一致。'}`,
      },
      {
        label: '验收标准',
        detail: `他人不追问也能执行：名称、包含、价格、规则四要素齐全。`,
      },
    ] satisfies AiOpsPlanSimpleAction[])

  const actions = mergeActionsWithDefaults(item.actions || [], defaultActions)

  return { title: t, body, actions }
}

/** 旧历史无 detailFlow 时，把短文案拆成可读流程 */
export function synthesizeSimpleDetailFlow(
  ...parts: Array<string | undefined | null>
): AiOpsPlanSimpleFlowItem[] {
  const text = parts.map((p) => asStr(p)).filter(Boolean).join('。')
  if (!text) return []
  const chunks = text
    .split(/[。；;\n]+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 4)
  if (!chunks.length) {
    return [fillSimpleFlowItem({ title: '说明', body: text, actions: [] }, { topic: text, summary: text })]
  }
  return chunks.slice(0, 6).map((body, i) =>
    fillSimpleFlowItem(
      {
        title: `第${i + 1}步`,
        body,
        actions: [{ label: '具体内容', detail: body }],
      },
      { topic: body, summary: text },
    ),
  )
}

/** 补全简易版所有 detailFlow 到最后一级「写满的明细」 */
export function ensureSimplePlanDetailDepth(plan: AiOpsPlanResult): AiOpsPlanResult {
  if (!isAiOpsPlanSimpleEdition(plan) || !plan.simplePlan) return plan
  const s = plan.simplePlan
  const emptyActs = (): AiOpsPlanSimpleAction[] => []
  const steps = s.steps.map((st) => {
    const baseFlow =
      st.detailFlow.length > 0
        ? st.detailFlow
        : [
            { title: '准备', body: '', actions: emptyActs() },
            { title: '执行', body: '', actions: emptyActs() },
            { title: '验收', body: '', actions: emptyActs() },
          ]
    return {
      ...st,
      detailFlow: baseFlow.map((f) =>
        fillSimpleFlowItem(f, { topic: st.title, summary: st.body, tip: st.tip }),
      ),
    }
  })
  const platforms = s.platforms.map((p) => {
    const baseFlow =
      p.detailFlow.length > 0
        ? p.detailFlow
        : [
            { title: '选题', body: '', actions: emptyActs() },
            { title: '拍摄/剪辑', body: '', actions: emptyActs() },
            { title: '发布挂链', body: '', actions: emptyActs() },
            { title: '复盘', body: '', actions: emptyActs() },
          ]
    return {
      ...p,
      detailFlow: baseFlow.map((f) =>
        fillSimpleFlowItem(f, {
          topic: p.how || `${p.platform}发布`,
          summary: p.how,
          tip: p.detailNote,
          platform: p.platform,
          sellingPoint: p.how,
        }),
      ),
    }
  })
  const combos = s.combos.map((c) => {
    const baseFlow =
      c.detailFlow.length > 0
        ? c.detailFlow
        : [
            { title: '组品', body: '', actions: emptyActs() },
            { title: '上架', body: '', actions: emptyActs() },
            { title: '核销话术', body: '', actions: emptyActs() },
          ]
    const summary = [c.sellingPoint, c.items ? `包含：${c.items}` : '', c.priceHint]
      .filter(Boolean)
      .join('。')
    return {
      ...c,
      detailFlow: baseFlow.map((f) =>
        fillSimpleFlowItem(f, {
          topic: c.name,
          summary,
          tip: c.detailNote,
          items: c.items,
          priceHint: c.priceHint,
          sellingPoint: c.sellingPoint,
        }),
      ),
    }
  })
  const checklist = s.checklist.map((item) => {
    const baseFlow =
      item.detailFlow.length > 0
        ? item.detailFlow
        : [
            { title: '做什么', body: '', actions: emptyActs() },
            { title: '完成标准', body: '', actions: emptyActs() },
          ]
    return {
      ...item,
      detailFlow: baseFlow.map((f) =>
        fillSimpleFlowItem(f, {
          topic: item.text,
          summary: item.detailNote || item.text,
          tip: item.detailNote,
        }),
      ),
    }
  })
  return {
    ...plan,
    planEdition: 'simple',
    simplePlan: { ...s, steps, platforms, combos, checklist },
  }
}

/** 解析简易版瘦 JSON */
export function normalizeAiOpsPlanSimplePlan(raw: unknown): AiOpsPlanSimplePlan | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const heroRaw = (o.hero ?? o.cover ?? o['封面']) as Record<string, unknown> | undefined
  const stepsRaw = Array.isArray(o.steps)
    ? o.steps
    : Array.isArray(o['本周步骤'])
      ? o['本周步骤']
      : []
  const platformsRaw = Array.isArray(o.platforms)
    ? o.platforms
    : Array.isArray(o['平台'])
      ? o['平台']
      : []
  const combosRaw = Array.isArray(o.combos)
    ? o.combos
    : Array.isArray(o['套餐'])
      ? o['套餐']
      : []
  const checklistRaw = Array.isArray(o.checklist)
    ? o.checklist
    : Array.isArray(o['清单'])
      ? o['清单']
      : []

  const hero: AiOpsPlanSimpleHero = {
    headline: asStr(heroRaw?.headline ?? heroRaw?.title ?? o.headline),
    summary: asStr(heroRaw?.summary ?? heroRaw?.desc ?? o.summary),
    storeHint: asStr(heroRaw?.storeHint ?? heroRaw?.store_hint ?? heroRaw?.store),
    periodHint: asStr(heroRaw?.periodHint ?? heroRaw?.period_hint ?? heroRaw?.period),
    budgetHint: asStr(heroRaw?.budgetHint ?? heroRaw?.budget_hint ?? heroRaw?.budget),
  }

  const steps: AiOpsPlanSimpleStep[] = stepsRaw
    .map((x) => {
      if (typeof x === 'string') {
        const t = asStr(x)
        return t
          ? { title: t, body: '', tip: '', detailFlow: [], detailNote: '' }
          : null
      }
      if (!x || typeof x !== 'object') return null
      const r = x as Record<string, unknown>
      const title = asStr(r.title ?? r.name)
      const body = asStr(r.body ?? r.desc ?? r.description)
      if (!title && !body) return null
      return {
        title: title || '下一步',
        body,
        tip: asStr(r.tip ?? r.hint),
        detailFlow: parseSimpleFlowItems(r.detailFlow ?? r.detail_flow ?? r.flow ?? r.steps),
        detailNote: asStr(r.detailNote ?? r.detail_note ?? r.note),
      }
    })
    .filter((x): x is AiOpsPlanSimpleStep => !!x)
    .slice(0, 5)

  const platforms: AiOpsPlanSimplePlatform[] = platformsRaw
    .map((x) => {
      if (!x || typeof x !== 'object') return null
      const r = x as Record<string, unknown>
      const platform = asStr(r.platform ?? r.name)
      const how = asStr(r.how ?? r.body ?? r.desc ?? r.tip)
      if (!platform && !how) return null
      return {
        platform: platform || '平台',
        how,
        detailFlow: parseSimpleFlowItems(r.detailFlow ?? r.detail_flow ?? r.flow ?? r.steps),
        detailNote: asStr(r.detailNote ?? r.detail_note ?? r.note),
      }
    })
    .filter((x): x is AiOpsPlanSimplePlatform => !!x)
    .slice(0, 4)

  const combos: AiOpsPlanSimpleCombo[] = combosRaw
    .map((x) => {
      if (!x || typeof x !== 'object') return null
      const r = x as Record<string, unknown>
      const name = asStr(r.name ?? r.title)
      if (!name) return null
      return {
        name,
        sellingPoint: asStr(r.sellingPoint ?? r.selling_point ?? r.point ?? r.desc),
        priceHint: asStr(r.priceHint ?? r.price_hint ?? r.price ?? r.priceYuan),
        items: asStr(r.items ?? r.includes ?? r.包含),
        detailFlow: parseSimpleFlowItems(r.detailFlow ?? r.detail_flow ?? r.flow ?? r.steps),
        detailNote: asStr(r.detailNote ?? r.detail_note ?? r.note),
      }
    })
    .filter((x): x is AiOpsPlanSimpleCombo => !!x)
    .slice(0, 4)

  const checklist: AiOpsPlanSimpleCheckItem[] = checklistRaw
    .map((x) => {
      if (typeof x === 'string') {
        const text = asStr(x)
        return text ? { text, detailFlow: [], detailNote: '' } : null
      }
      if (!x || typeof x !== 'object') return null
      const r = x as Record<string, unknown>
      const text = asStr(r.text ?? r.title ?? r.item ?? r.name)
      if (!text) return null
      return {
        text,
        detailFlow: parseSimpleFlowItems(r.detailFlow ?? r.detail_flow ?? r.flow ?? r.steps),
        detailNote: asStr(r.detailNote ?? r.detail_note ?? r.note ?? r.how),
      }
    })
    .filter((x): x is AiOpsPlanSimpleCheckItem => !!x)
    .slice(0, 8)

  if (!hero.headline && !steps.length && !checklist.length && !combos.length) return null
  return { hero, steps, platforms, combos, checklist }
}

/** 宽松解析模型 JSON → 六块结构（缺字段补空）；简易版走瘦 schema */
export function normalizeAiOpsPlanResult(raw: unknown): AiOpsPlanResult | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const nestedSimple = o.simplePlan ?? o.simple_plan
  const explicitSimple = o.planEdition === 'simple' || o.plan_edition === 'simple'
  const hasSix =
    !!(o.opsPlan ?? o.ops_plan ?? o['运营方案']) ||
    !!(o.executionPlan ?? o.execution_plan) ||
    !!(o.marketingBudget ?? o.marketing_budget)
  const looksSimple =
    explicitSimple ||
    !!nestedSimple ||
    (!hasSix && (!!o.hero || Array.isArray(o.steps) || Array.isArray(o.checklist)))

  if (looksSimple) {
    const simpleSrc =
      nestedSimple && typeof nestedSimple === 'object' ? nestedSimple : o
    const simplePlan = normalizeAiOpsPlanSimplePlan(simpleSrc)
    if (!simplePlan) return null
    return { ...emptyAiOpsPlanStandardBlocks(), planEdition: 'simple', simplePlan }
  }

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
    planEdition: 'standard',
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
      ...((): { libraryInsight?: AiOpsPlanTalentLibraryInsight } => {
        const raw = (talent?.libraryInsight ?? talent?.library_insight) as
          | Record<string, unknown>
          | undefined
        if (!raw || typeof raw !== 'object') return {}
        const headSamples = Array.isArray(raw.headSamples)
          ? raw.headSamples.map((x) => asStr(x)).filter(Boolean).slice(0, 12)
          : Array.isArray(raw.head_samples)
            ? raw.head_samples.map((x) => asStr(x)).filter(Boolean).slice(0, 12)
            : []
        const midTailSamples = Array.isArray(raw.midTailSamples)
          ? raw.midTailSamples.map((x) => asStr(x)).filter(Boolean).slice(0, 12)
          : Array.isArray(raw.mid_tail_samples)
            ? raw.mid_tail_samples.map((x) => asStr(x)).filter(Boolean).slice(0, 12)
            : []
        return {
          libraryInsight: {
            sourceLabel: asStr(raw.sourceLabel ?? raw.source_label),
            citySource: asStr(raw.citySource ?? raw.city_source),
            filterCity: asStr(raw.filterCity ?? raw.filter_city),
            platform: asStr(raw.platform),
            headCount: Math.max(0, Math.round(asNum(raw.headCount ?? raw.head_count))),
            midTailCount: Math.max(0, Math.round(asNum(raw.midTailCount ?? raw.mid_tail_count))),
            headSamples,
            midTailSamples,
            tierAvgSummary: asStr(raw.tierAvgSummary ?? raw.tier_avg_summary),
            matchedEntries: Math.max(
              0,
              Math.round(asNum(raw.matchedEntries ?? raw.matched_entries)),
            ),
          },
        }
      })(),
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
  if (isAiOpsPlanSimpleEdition(plan) && plan.simplePlan) {
    const s = plan.simplePlan
    return (
      !!s.hero.headline ||
      s.steps.length > 0 ||
      s.checklist.length > 0 ||
      s.combos.length > 0 ||
      s.platforms.length > 0
    )
  }
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


function parseIsoDateRange(dateRange: string): { start: string; end: string } | null {
  const isos = [...String(dateRange || '').matchAll(/(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]!)
  if (isos.length >= 2) return { start: isos[0]!, end: isos[1]! }
  if (isos.length === 1) return { start: isos[0]!, end: isos[0]! }
  const cn = [...String(dateRange || '').matchAll(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/g)].map(
    (m) => `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`,
  )
  if (cn.length >= 2) return { start: cn[0]!, end: cn[1]! }
  if (cn.length === 1) return { start: cn[0]!, end: cn[0]! }
  return null
}

function listIsoDaysInclusive(start: string, end: string, maxDays = 45): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    return []
  }
  const out: string[] = []
  let cur = start
  while (cur <= end && out.length < maxDays) {
    out.push(cur)
    cur = addDaysIso(cur, 1)
  }
  return out
}

type PhaseKind = 'seed' | 'convert' | 'repurchase' | 'generic'

function detectPhaseKind(phaseName: string): PhaseKind {
  const n = phaseName || ''
  if (/种草|预热|筹备|启动|冷启/.test(n)) return 'seed'
  if (/转化|投放|爆发|冲刺|核销/.test(n)) return 'convert'
  if (/复购|沉淀|会员|收尾|复盘/.test(n)) return 'repurchase'
  return 'generic'
}

function phaseDayPlaybook(
  kind: PhaseKind,
  dayIndex: number,
  phaseName: string,
  ownerFallback: string,
): AiOpsPlanPhaseDetailItem {
  const owner = ownerFallback || '运营负责人'
  const seed: Array<Omit<AiOpsPlanPhaseDetailItem, 'day'>> = [
    {
      task: '确认项目执行口径与对接人',
      howTo: '对齐预算/平台/成功指标；书面确认探店与直播窗口，建群同步日报节奏。',
      ownerRole: owner,
      deliverable: '执行口径确认纪要',
    },
    {
      task: '锁定补贴/本地推预算池',
      howTo: '按渠道拆分达人费与投流；登记可用券面/让利上限，避免超发。',
      ownerRole: '投放/运营',
      deliverable: '预算池锁定表',
    },
    {
      task: '确认活动货盘与主推券面',
      howTo: '选定 3～5 个主推组品；写清原价/活动价/库存与核销规则。',
      ownerRole: '商品运营',
      deliverable: '活动货盘清单',
    },
    {
      task: '达人招募启动（Brief+档期）',
      howTo: '按探店/团购/颜值分层邀约；Brief 含钩子句、POI、挂链与禁止项。',
      ownerRole: '媒介',
      deliverable: '达人邀约表',
    },
    {
      task: '摄影师/物料到场补拍',
      howTo: '补门头、出餐、核销动作空镜，供云剪与官号二次创作。',
      ownerRole: '内容',
      deliverable: '空镜素材包',
    },
    {
      task: '达人到店探店拍摄',
      howTo: '按 Brief 拍钩子-体验-核销三幕式；当场核对套餐露出与口播。',
      ownerRole: '达人/内容',
      deliverable: '探店原始素材',
    },
  ]
  const convert: Array<Omit<AiOpsPlanPhaseDetailItem, 'day'>> = [
    {
      task: '成片联合审片（商家×运营）',
      howTo: '核对口播、字幕、套餐露出与合规；书面确认后方可发布。',
      ownerRole: '商家运营',
      deliverable: '审片确认单',
    },
    {
      task: '创建话题/打卡挑战标签',
      howTo: '上线活动#话题与 POI 入口文案；官号置顶活动说明。',
      ownerRole: '运营',
      deliverable: '话题页与物料',
    },
    {
      task: '预热短视频与海报发布',
      howTo: '官号+达人协同发预告；挂团购组件，投流小预算测点击。',
      ownerRole: '投放',
      deliverable: '预热内容上线',
    },
    {
      task: '正片集中发布+本地推优化',
      howTo: '按类目高峰窗口发布；盯 CTR/进店，放大过验素材。',
      ownerRole: '投放/达人',
      deliverable: '发布与投流日报',
    },
    {
      task: '直播彩排（设备/口播/福袋）',
      howTo: '走一遍货盘讲解与福袋规则；检查推流、灯光、收银核销。',
      ownerRole: '直播运营',
      deliverable: '彩排 checklist',
    },
    {
      task: '正式开播带货盯盘',
      howTo: '场控+投流协同；实时替换高转化话术与券面。',
      ownerRole: '直播运营',
      deliverable: '直播战报初稿',
    },
  ]
  const repurchase: Array<Omit<AiOpsPlanPhaseDetailItem, 'day'>> = [
    {
      task: '核销催单与好评引导',
      howTo: '未核销用户短信/社群提醒；到店引导晒图返券或积分。',
      ownerRole: '客服',
      deliverable: '催核销记录',
    },
    {
      task: '会员沉淀与复购券投放',
      howTo: '沉淀新客进社群/会员；推次单复购券或升杯套餐。',
      ownerRole: '私域',
      deliverable: '会员池增量',
    },
    {
      task: '数据复盘与战报输出',
      howTo: '汇总曝光/进店/核销GMV/好评；沉淀可复用脚本与达人池。',
      ownerRole: owner,
      deliverable: '周期战报',
    },
    {
      task: '下一轮货盘与达人储备',
      howTo: '根据战报调整券面与达人层级；预锁下一节点档期。',
      ownerRole: '运营/媒介',
      deliverable: '下轮启动清单',
    },
  ]
  const generic: Array<Omit<AiOpsPlanPhaseDetailItem, 'day'>> = [
    {
      task: `${phaseName || '阶段'}关键动作推进`,
      howTo: '对照周计划拆日任务；日清阻塞项并同步甲方。',
      ownerRole: owner,
      deliverable: '日报',
    },
    {
      task: '内容生产与审核',
      howTo: '完成拍摄/剪辑/商家确认，确保挂链与 POI 正确。',
      ownerRole: '内容',
      deliverable: '可发布成片',
    },
    {
      task: '投放与转化盯盘',
      howTo: '按 ROI 调整预算；同步核销与库存风险。',
      ownerRole: '投放',
      deliverable: '盯盘纪要',
    },
    {
      task: '复盘优化',
      howTo: '记录有效钩子与达人表现，沉淀到素材库。',
      ownerRole: owner,
      deliverable: '优化清单',
    },
  ]
  const pack =
    kind === 'seed' ? seed : kind === 'convert' ? convert : kind === 'repurchase' ? repurchase : generic
  const tpl = pack[Math.min(dayIndex, pack.length - 1)]!
  // 长阶段在包内循环时带序号，避免同文案堆叠
  const cycle = Math.floor(dayIndex / pack.length)
  const task =
    cycle > 0 && dayIndex >= pack.length ? `${tpl.task}（第${cycle + 1}轮推进）` : tpl.task
  return {
    day: '',
    task,
    howTo: tpl.howTo,
    ownerRole: tpl.ownerRole,
    deliverable: tpl.deliverable,
  }
}

/** 阶段细分不足时按日补齐（对齐万象城日历粒度：确认→货盘→招募→拍摄→审片→话题→预热→开播→战报） */
export function ensurePhaseDetailDensity(plan: AiOpsPlanResult): AiOpsPlanResult {
  const phases = (plan.executionPlan.phases || []).map((phase) => {
    const range = parseIsoDateRange(phase.dateRange)
    if (!range) return phase
    const days = listIsoDaysInclusive(range.start, range.end, 40)
    if (!days.length) return phase
    const kind = detectPhaseKind(phase.phase)
    const existing = [...(phase.detailItems || [])]
    const byDay = new Map<string, AiOpsPlanPhaseDetailItem>()
    for (const d of existing) {
      const iso = (d.day.match(/\d{4}-\d{2}-\d{2}/) || [])[0] || ''
      if (iso) byDay.set(iso, { ...d, day: iso, howTo: d.howTo || '' })
    }
    // 短阶段每日；>10 天则隔日，保证最少 4 条、最多 16 条
    const step = days.length > 10 ? 2 : 1
    const targetDays = days.filter((_, i) => i % step === 0).slice(0, 16)
    if (targetDays.length < 4) {
      for (const d of days) {
        if (!targetDays.includes(d)) targetDays.push(d)
        if (targetDays.length >= 4) break
      }
    }
    const merged: AiOpsPlanPhaseDetailItem[] = []
    targetDays.forEach((iso, idx) => {
      const hit = byDay.get(iso)
      if (hit && hit.task.trim()) {
        merged.push({
          ...hit,
          howTo:
            hit.howTo?.trim() ||
            phaseDayPlaybook(kind, idx, phase.phase, phase.ownerRole).howTo,
        })
        byDay.delete(iso)
        return
      }
      const gen = phaseDayPlaybook(kind, idx, phase.phase, phase.ownerRole)
      merged.push({ ...gen, day: iso })
    })
    // 保留无法归日的模型原创任务
    for (const d of existing) {
      const iso = (d.day.match(/\d{4}-\d{2}-\d{2}/) || [])[0] || ''
      if (!iso && d.task.trim()) merged.push(d)
    }
    return { ...phase, detailItems: merged.slice(0, 24) }
  })
  return {
    ...plan,
    executionPlan: { ...plan.executionPlan, phases },
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

  // 对齐万象城进度表：补充确认货盘/话题/彩排/战报等逐日节点
  const denseTemplates: Array<{
    offset: number
    time: string
    item: string
    dependency: string
    ownerRole: string
    statusHint: string
  }> = [
    {
      offset: Math.min(1, days - 1),
      time: '10:30',
      item: '确认项目执行情况与甲方对接节奏',
      dependency: '签约/预算确认',
      ownerRole: '运营负责人',
      statusHint: '建立日报与验收标准',
    },
    {
      offset: Math.min(2, days - 1),
      time: '14:00',
      item: '锁定补贴/本地推等投放资源',
      dependency: '执行口径确认',
      ownerRole: '投放',
      statusHint: '登记可用预算池',
    },
    {
      offset: Math.min(Math.max(3, Math.floor(days * 0.1)), days - 1),
      time: '15:00',
      item: '确认活动货盘与主推券面',
      dependency: '预算池锁定',
      ownerRole: '商品运营',
      statusHint: '输出可上架组品清单',
    },
    {
      offset: Math.min(Math.max(4, Math.floor(days * 0.18)), days - 1),
      time: '11:00',
      item: '达人招募推进（Brief 与档期确认）',
      dependency: '货盘确认',
      ownerRole: '媒介',
      statusHint: '分层邀约并锁档',
    },
    {
      offset: Math.min(Math.max(5, Math.floor(days * 0.22)), days - 1),
      time: '14:00',
      item: '摄影师到场补拍空镜/云剪素材',
      dependency: '达人档期',
      ownerRole: '内容',
      statusHint: '门头出餐核销空镜齐套',
    },
    {
      offset: Math.min(Math.max(8, Math.floor(days * 0.35)), days - 1),
      time: '16:00',
      item: '联合审片并创建活动话题#',
      dependency: '成片交付',
      ownerRole: '运营/商家',
      statusHint: '话题页与 POI 文案上线',
    },
    {
      offset: Math.min(Math.max(9, Math.floor(days * 0.42)), days - 1),
      time: '12:00',
      item: '发布预热短视频与直播预告海报',
      dependency: '话题创建',
      ownerRole: '运营',
      statusHint: '官号+达人协同预热',
    },
    {
      offset: Math.min(Math.max(15, Math.floor(days * 0.8)), days - 1),
      time: '17:00',
      item: '直播彩排（设备/口播/福袋）',
      dependency: '直播档期确认',
      ownerRole: '直播运营',
      statusHint: '开播前至少彩排一次',
    },
    {
      offset: Math.min(Math.max(days - 3, Math.floor(days * 0.9)), days - 1),
      time: '18:00',
      item: '数据复盘输出周期战报',
      dependency: '投放与直播完成',
      ownerRole: '运营负责人',
      statusHint: '含 GMV/核销/内容复盘',
    },
    {
      offset: Math.max(0, days - 1),
      time: '11:00',
      item: '启动下一轮货盘与达人储备',
      dependency: '战报确认',
      ownerRole: '运营/媒介',
      statusHint: '预锁下一节点',
    },
  ]

  const existingKeys = new Set(
    [...patched, ...extras].map((m) => `${m.date}|${m.item.slice(0, 18)}`),
  )
  for (const t of denseTemplates) {
    const date = clampIsoInPeriod(addDaysIso(start, t.offset), start, end)
    const key = `${date}|${t.item.slice(0, 18)}`
    if (existingKeys.has(key)) continue
    // 避免与同日已有明确 kind 节点语义完全重复
    const sameDay = [...patched, ...extras].some(
      (m) => m.date === date && (m.item.includes(t.item.slice(0, 6)) || t.item.includes(m.item.slice(0, 6))),
    )
    if (sameDay) continue
    extras.push({
      date,
      time: t.time,
      item: t.item,
      dependency: t.dependency,
      ownerRole: t.ownerRole,
      statusHint: t.statusHint,
      kind: 'other',
    })
    existingKeys.add(key)
  }

  const milestones = [...patched, ...extras]
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .slice(0, 120)

  return {
    ...plan,
    calendar: { milestones },
  }
}

/** 服务端/客户端统一后处理：ROI → 目标对齐 → 阶段日粒度 → 日历补全（简易版跳过） */
export function enrichAiOpsPlanPostProcess(
  plan: AiOpsPlanResult,
  opts?: AiOpsPlanEnrichOpts,
): AiOpsPlanResult {
  if (isAiOpsPlanSimpleEdition(plan)) return plan
  let next = ensureMarketingRoiFallback(plan, opts)
  next = alignOpsPlanGoalsToRoi(next, opts)
  next = ensurePhaseDetailDensity(next)
  next = ensureCalendarMilestones(next, opts)
  return next
}

function formatSimpleFlowMd(flow: AiOpsPlanSimpleFlowItem[]): string[] {
  const lines: string[] = []
  flow.forEach((f, i) => {
    lines.push(`${i + 1}. **${f.title}**：${f.body || ''}`)
    for (const a of f.actions || []) {
      lines.push(`   - **${a.label}**：${a.detail}`)
    }
  })
  return lines
}

function aiOpsSimplePlanToMarkdown(plan: AiOpsPlanResult, meta?: { title?: string }): string {
  const deep = ensureSimplePlanDetailDepth(plan)
  const s = deep.simplePlan
  const lines: string[] = []
  if (meta?.title) lines.push(`# ${meta.title}`, '')
  else lines.push('# AI 运营方案（简易版）', '')
  if (!s) return lines.join('\n')
  if (s.hero.headline) lines.push(`## ${s.hero.headline}`, '')
  if (s.hero.summary) lines.push(s.hero.summary, '')
  const hints = [s.hero.storeHint, s.hero.periodHint, s.hero.budgetHint].filter(Boolean)
  if (hints.length) lines.push(hints.join(' · '), '')
  if (s.steps.length) {
    lines.push('## 本周先做什么', '')
    s.steps.forEach((st, i) => {
      lines.push(`### ${i + 1}. ${st.title}`)
      if (st.body) lines.push(st.body)
      if (st.tip) lines.push(`> 小贴士：${st.tip}`)
      if (st.detailFlow.length) {
        lines.push('', '细流程：')
        lines.push(...formatSimpleFlowMd(st.detailFlow))
      }
      lines.push('')
    })
  }
  if (s.platforms.length) {
    lines.push('## 各平台怎么发', '')
    for (const p of s.platforms) {
      lines.push(`### ${p.platform}`)
      lines.push(p.how)
      if (p.detailFlow.length) lines.push(...formatSimpleFlowMd(p.detailFlow))
      lines.push('')
    }
  }
  if (s.combos.length) {
    lines.push('## 推荐套餐', '')
    for (const c of s.combos) {
      const price = c.priceHint ? `（${c.priceHint}）` : ''
      lines.push(`### ${c.name}${price}`)
      lines.push(c.sellingPoint)
      if (c.items) lines.push(`包含：${c.items}`)
      if (c.detailFlow.length) lines.push(...formatSimpleFlowMd(c.detailFlow))
      lines.push('')
    }
  }
  if (s.checklist.length) {
    lines.push('## 落地清单', '')
    for (const item of s.checklist) {
      lines.push(`- [ ] ${item.text}`)
      if (item.detailFlow.length) {
        for (const f of item.detailFlow) {
          lines.push(`  - **${f.title}**：${f.body}`)
          for (const a of f.actions || []) lines.push(`    - **${a.label}**：${a.detail}`)
        }
      }
    }
    lines.push('')
  }
  return lines.join('\n')
}

export function aiOpsPlanToMarkdown(plan: AiOpsPlanResult, meta?: { title?: string }): string {
  if (isAiOpsPlanSimpleEdition(plan)) return aiOpsSimplePlanToMarkdown(plan, meta)
  const lines: string[] = []
  if (meta?.title) lines.push(`# ${meta.title}`, '')
  lines.push('## 1. 运营方案', '')
  lines.push('### 一、活动背景与目标', '')
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
  if (plan.talentBudget.libraryInsight) {
    const li = plan.talentBudget.libraryInsight
    lines.push(
      `**星选达人库：** ${li.sourceLabel}`,
      `- 头部（5级及以上）：${li.headCount} 人${li.headSamples.length ? `；代表 ${li.headSamples.join('、')}` : ''}`,
      `- 腰尾部（3–4级）：${li.midTailCount} 人${li.midTailSamples.length ? `；代表 ${li.midTailSamples.join('、')}` : ''}`,
      '',
    )
  }
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
