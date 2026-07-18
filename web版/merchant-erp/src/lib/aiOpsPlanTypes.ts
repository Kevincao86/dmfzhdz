/** AI 运营方案六块结构化结果（对齐腾讯文档子表，执行落到小时） */

export type AiOpsPlanPlatformStrategy = {
  platform: string
  approach: string
  contentTypes: string
  publishFreq: string
  kpi: string
  examples: string
}

export type AiOpsPlanPhase = {
  phase: string
  dateRange: string
  actions: string
  ownerRole: string
  deliverable: string
  successMetric: string
}

export type AiOpsPlanWeeklyAction = {
  week: string
  dateRange: string
  focus: string
  tasks: string
  ownerRole: string
}

/** 落到小时的执行排期（核心加细字段） */
export type AiOpsPlanHourlySlot = {
  date: string
  timeStart: string
  timeEnd: string
  task: string
  ownerRole: string
  location: string
  deliverable: string
  notes: string
}

export type AiOpsPlanBudgetChannel = {
  channel: string
  amountYuan: number
  ratioPct: number
  month: string
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
    /** 小时级排期，至少覆盖周期内关键工作日 */
    hourlySchedule: AiOpsPlanHourlySlot[]
  }
  marketingBudget: {
    totalBudget: number
    channels: AiOpsPlanBudgetChannel[]
    assumptions: string
    contingencyPct: number
  }
  calendar: {
    milestones: AiOpsPlanMilestone[]
  }
  talentBudget: {
    talentRows: AiOpsPlanTalentRow[]
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
  menuSummary?: string
  margins?: { douyin: number; meituan: number; xhs: number }
  industryPath?: string
  competitorSummary?: string
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
        .map((r) => ({
          phase: asStr(r.phase),
          dateRange: asStr(r.dateRange ?? r.date_range),
          actions: asStr(r.actions),
          ownerRole: asStr(r.ownerRole ?? r.owner_role),
          deliverable: asStr(r.deliverable),
          successMetric: asStr(r.successMetric ?? r.success_metric),
        }))
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
        .map((r) => ({
          date: asStr(r.date),
          timeStart: asStr(r.timeStart ?? r.time_start ?? r.start),
          timeEnd: asStr(r.timeEnd ?? r.time_end ?? r.end),
          task: asStr(r.task ?? r.item ?? r.actions),
          ownerRole: asStr(r.ownerRole ?? r.owner_role),
          location: asStr(r.location),
          deliverable: asStr(r.deliverable),
          notes: asStr(r.notes),
        }))
        .filter((r) => r.date || r.task)
        .slice(0, 120),
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
    plan.productBoard.combos.length > 0
  )
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
    lines.push('### 小时级排期', '')
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

  lines.push('## 5. 预算分配明细（达人）', '')
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
