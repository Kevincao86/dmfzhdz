/** AI 运营方案六块结构化结果（对齐腾讯文档子表，执行落到小时） */

export type AiOpsPlanPlatformStrategy = {
  platform: string
  approach: string
  contentTypes: string
  publishFreq: string
  kpi: string
  examples: string
}

export type AiOpsPlanPhaseDetailItem = {
  day: string
  task: string
  ownerRole: string
  deliverable: string
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
    positioning: string
    targetAudience: string
    goals: string[]
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
  evidence: '本地生活餐饮多平台综合核销转化约 2%～5%（跨平台案例库中位），按保守中位测算',
}

export function resolveAiOpsRoiIndustryBench(channel: string): AiOpsRoiIndustryBench {
  const t = String(channel || '')
  for (const b of AI_OPS_ROI_INDUSTRY_BENCHES) {
    if (b.match.test(t)) return b
  }
  return DEFAULT_ROI_BENCH
}

export function formatAiOpsRoiEvidenceNote(channel: string, bench?: AiOpsRoiIndustryBench): string {
  const b = bench || resolveAiOpsRoiIndustryBench(channel)
  return `${b.platformLabel}行业中位核销转化 ${b.convLow}%～${b.convHigh}%；${b.evidence}；测算 ROI≈${b.roiMid}、回本约${b.paybackDays}天`
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

  return {
    opsPlan: {
      background: asStr(ops?.background),
      positioning: asStr(ops?.positioning),
      targetAudience: asStr(ops?.targetAudience ?? ops?.target_audience),
      goals: asStrArr(ops?.goals),
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
        }))
        .filter((r) => r.date || r.item)
        .slice(0, 60),
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

/** 用行业分平台转化率区间重写 ROI 说明，并在缺失时按渠道合成投产 */
export function ensureMarketingRoiFallback(plan: AiOpsPlanResult): AiOpsPlanResult {
  let roiAnalysis = [...(plan.marketingBudget.roiAnalysis || [])]

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
        const bench = resolveAiOpsRoiIndustryBench(c.channel)
        const invest = c.amountYuan
        const expectedGmvYuan = Math.round(invest * bench.roiMid)
        const expectedOrders = Math.max(1, Math.round(expectedGmvYuan / bench.aovYuan))
        return {
          channel: c.channel,
          investYuan: invest,
          expectedGmvYuan,
          expectedOrders,
          roi: Math.round(bench.roiMid * 100) / 100,
          paybackDays: bench.paybackDays,
          note: formatAiOpsRoiEvidenceNote(c.channel, bench),
        }
      })
  } else {
    roiAnalysis = roiAnalysis.map((r) => {
      const bench = resolveAiOpsRoiIndustryBench(r.channel)
      const note =
        !r.note?.trim() || looksLikeAssumedConvNote(r.note)
          ? formatAiOpsRoiEvidenceNote(r.channel, bench)
          : /行业中位|核销转化\s*\d/.test(r.note)
            ? r.note
            : `${r.note}；依据：${formatAiOpsRoiEvidenceNote(r.channel, bench)}`
      // 若模型只给了「假设转化率」类说明且 ROI/GMV 明显不合理，按行业中位校正
      let expectedGmvYuan = r.expectedGmvYuan
      let expectedOrders = r.expectedOrders
      let roi = r.roi
      let paybackDays = r.paybackDays
      if (looksLikeAssumedConvNote(r.note) && r.investYuan > 0) {
        expectedGmvYuan = Math.round(r.investYuan * bench.roiMid)
        expectedOrders = Math.max(1, Math.round(expectedGmvYuan / bench.aovYuan))
        roi = Math.round(bench.roiMid * 100) / 100
        paybackDays = bench.paybackDays
      }
      return { ...r, note, expectedGmvYuan, expectedOrders, roi, paybackDays }
    })
  }

  const totalInvest = roiAnalysis.reduce((s, r) => s + r.investYuan, 0)
  const totalGmv = roiAnalysis.reduce((s, r) => s + r.expectedGmvYuan, 0)
  const roi = totalInvest > 0 ? Math.round((totalGmv / totalInvest) * 100) / 100 : 0
  const roiSummary =
    plan.marketingBudget.roiSummary && !looksLikeAssumedConvNote(plan.marketingBudget.roiSummary)
      ? plan.marketingBudget.roiSummary
      : `周期内预计总投入约 ¥${Math.round(totalInvest).toLocaleString('zh-CN')}，预计带动 GMV 约 ¥${Math.round(totalGmv).toLocaleString('zh-CN')}，综合 ROI 约 ${roi}。分渠道核销转化取各平台行业中位区间（直播 8%～15%、抖音短视频 2.5%～6%、本地推 1.8%～3.5%、小红书 0.9%～2.4%、美团/点评搜索 5%～12%），并结合货盘与达人质量浮动。`

  let assumptions = plan.marketingBudget.assumptions || ''
  if (!assumptions.trim() || looksLikeAssumedConvNote(assumptions)) {
    assumptions =
      '测算依据：各平台核销转化取本地生活餐饮行业中位区间（非单店拍脑袋假设）；客单按餐饮团购中位；实际受货盘吸引力、核销率、达人匹配与档期影响，建议按周复盘校正。'
  }

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

export function aiOpsPlanToMarkdown(plan: AiOpsPlanResult, meta?: { title?: string }): string {
  const lines: string[] = []
  if (meta?.title) lines.push(`# ${meta.title}`, '')
  lines.push('## 1. 运营方案', '')
  if (plan.opsPlan.background) lines.push(`**背景：** ${plan.opsPlan.background}`, '')
  if (plan.opsPlan.positioning) lines.push(`**定位：** ${plan.opsPlan.positioning}`, '')
  if (plan.opsPlan.targetAudience) lines.push(`**人群：** ${plan.opsPlan.targetAudience}`, '')
  if (plan.opsPlan.goals.length) {
    lines.push('**目标：**')
    for (const g of plan.opsPlan.goals) lines.push(`- ${g}`)
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
    }
    lines.push('')
  }
  if (plan.executionPlan.weeklyActions.length) {
    lines.push('| 周次 | 日期 | 重点 | 任务 | 角色 |', '| --- | --- | --- | --- | --- |')
    for (const r of plan.executionPlan.weeklyActions) {
      lines.push(`| ${r.week} | ${r.dateRange} | ${r.focus} | ${r.tasks} | ${r.ownerRole} |`)
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
      '| 渠道 | 投入 | 预计GMV | 预计订单 | ROI | 回本天数 | 说明 |',
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
    lines.push('| 日期 | 时间 | 事项 | 依赖 | 角色 | 状态建议 |', '| --- | --- | --- | --- | --- | --- |')
    for (const r of plan.calendar.milestones) {
      lines.push(
        `| ${r.date} | ${r.time} | ${r.item} | ${r.dependency} | ${r.ownerRole} | ${r.statusHint} |`,
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
