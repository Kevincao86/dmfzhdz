/**
 * 九大场景标准工作流 — 供 LLM 系统提示、执行预览卡片、方案引导共用。
 */
import type { AiPermissionId, AiTaskType } from './aiAgentTypes'
import { AI_TASK_TYPE_LABELS } from './aiAgentTypes'

export type ScenarioPhase = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6'

export type ScenarioWorkflowDef = {
  taskType: AiTaskType
  label: string
  phase: ScenarioPhase
  phaseLabel: string
  previewTitle: string
  /** 预览卡片步骤（用户可见） */
  previewSteps: string[]
  /** LLM 须按序遵循的业务步骤 */
  workflowSteps: string[]
  deliverables: string[]
  downstream: AiTaskType[]
  requiredPermissions: AiPermissionId[]
}

const PHASE_LABEL: Record<ScenarioPhase, string> = {
  P1: '货盘准备',
  P2: '获客放大',
  P3: '转化跟进',
  P4: '履约口碑',
  P5: '经营诊断',
  P6: '财务收口',
}

export const AI_AGENT_SCENARIO_WORKFLOWS: Record<AiTaskType, ScenarioWorkflowDef> = {
  create_product: {
    taskType: 'create_product',
    label: AI_TASK_TYPE_LABELS.create_product,
    phase: 'P1',
    phaseLabel: PHASE_LABEL.P1,
    previewTitle: '创建商品任务',
    previewSteps: [
      '解析商品类型与目标平台（抖音来客 / 美团 / 小红书等）',
      '生成 3 个候选商品标题与套餐结构草稿',
      '校验类目模板字段与图片规范',
      '展示执行预览；确认后写入草稿或提交审核',
    ],
    workflowSteps: [
      '识别商品类型、售价、适用人数与目标平台',
      '结合门店经营情报输出可落地组品方案（含具体套餐名与价格）',
      '若无商品图：提示上传或回复「自动生成」',
      '生成执行预览 JSON（actionType: create_product，confirmRequired: true）',
      '用户确认后进入商品创建流程，不宣称已上架',
    ],
    deliverables: ['可售 SKU 草稿', '主图/辅图方案', '平台类目字段清单'],
    downstream: ['generate_copywriting', 'sync_platform', 'recruit_influencer'],
    requiredPermissions: ['product'],
  },
  generate_copywriting: {
    taskType: 'generate_copywriting',
    label: AI_TASK_TYPE_LABELS.generate_copywriting,
    phase: 'P1',
    phaseLabel: PHASE_LABEL.P1,
    previewTitle: '推广文案生成',
    previewSteps: [
      '读取商品/活动卖点与平台禁词表',
      '生成多平台文案（标题、短描述、话题标签、口播要点）',
      '展示预览；确认后写入素材库或投放草稿',
    ],
    workflowSteps: [
      '锚定关联商品或活动与目标平台',
      '输出分平台文案包（标题/短描述/标签/30 秒口播可选）',
      '遵守禁词与广告合规，不夸大疗效与承诺',
      '生成预览 JSON（actionType: generate_copywriting，confirmRequired: true）',
      '确认后写入素材库，不宣称已自动发布',
    ],
    deliverables: ['多平台文案包', '话题标签', '可选短视频脚本'],
    downstream: ['recruit_influencer', 'optimize_local_ads'],
    requiredPermissions: ['product'],
  },
  recruit_influencer: {
    taskType: 'recruit_influencer',
    label: AI_TASK_TYPE_LABELS.recruit_influencer,
    phase: 'P2',
    phaseLabel: PHASE_LABEL.P2,
    previewTitle: '达人招募任务',
    previewSteps: [
      '按门店与城市筛选达人池与粉丝量级',
      '生成招募 Brief 与佣金分配（本地生活 1～5%，默认 3%）',
      '展示邀约批次预览；确认后创建招募单',
    ],
    workflowSteps: [
      '明确城市、粉丝量级、探店/种草形式与预算',
      '输出 Brief：门店信息、拍摄要求、佣金与交付物',
      '佣金按团购习惯 1～5%，默认 3%；禁止无故写 20%+ CPS',
      '生成预览 JSON（actionType: recruit_influencer，confirmRequired: true）',
      '确认后创建邀约批次，不宣称已发送达人私信',
    ],
    deliverables: ['招募 Brief', '达人筛选条件', '佣金与预算表'],
    downstream: ['follow_local_lead', 'handle_review'],
    requiredPermissions: ['influencer'],
  },
  optimize_local_ads: {
    taskType: 'optimize_local_ads',
    label: AI_TASK_TYPE_LABELS.optimize_local_ads,
    phase: 'P2',
    phaseLabel: PHASE_LABEL.P2,
    previewTitle: '优化本地推',
    previewSteps: [
      '读取本地推投放与线索转化数据',
      '诊断定向、出价、素材与时段问题',
      '输出调优方案预览；确认后给出可执行调整建议',
    ],
    workflowSteps: [
      '明确优化目标（降 CPA / 提线索量 / 提 ROI）与时间范围',
      '结合 GEO 与活动情报给出定向、出价、素材、时段建议',
      '量化预期变化；高风险预算调整须标注 riskLevel',
      '生成预览 JSON（actionType: optimize_local_ads，confirmRequired: true）',
      '确认后输出操作建议，不宣称已改账户配置',
    ],
    deliverables: ['投流诊断', '调优动作清单', '预期指标'],
    downstream: ['follow_local_lead', 'analyze_exception'],
    requiredPermissions: ['local_ads'],
  },
  sync_platform: {
    taskType: 'sync_platform',
    label: AI_TASK_TYPE_LABELS.sync_platform,
    phase: 'P2',
    phaseLabel: PHASE_LABEL.P2,
    previewTitle: '平台同步任务',
    previewSteps: [
      '比对 ERP 与各平台商品/库存/价格差异',
      '生成同步项清单（新增、更新、下架）',
      '展示预览；确认后逐项同步并输出报告',
    ],
    workflowSteps: [
      '识别涉及平台与差异类型（价、库存、上下架）',
      '列出待同步项与风险（误下架须标 high）',
      '生成预览 JSON（actionType: sync_platform，confirmRequired: true）',
      '确认后调用同步接口并汇总成功/失败项',
    ],
    deliverables: ['差异清单', '同步结果报告'],
    downstream: ['analyze_exception', 'create_product'],
    requiredPermissions: ['sync'],
  },
  follow_local_lead: {
    taskType: 'follow_local_lead',
    label: AI_TASK_TYPE_LABELS.follow_local_lead,
    phase: 'P3',
    phaseLabel: PHASE_LABEL.P3,
    previewTitle: '跟进本地推线索',
    previewSteps: [
      '拉取待跟进线索并按意向分级',
      '生成跟进话术/外呼脚本',
      '展示预览；确认后更新跟进状态',
    ],
    workflowSteps: [
      '按来源（本地推/私信/预约）与时间筛选线索',
      '分级（高/中/低意向）并给出下一步动作',
      '生成可复制的跟进话术；敏感信息脱敏',
      '生成预览 JSON（actionType: follow_local_lead，confirmRequired: true）',
      '确认后标记跟进结果，不虚构已接通电话',
    ],
    deliverables: ['线索分级表', '跟进话术', '状态更新建议'],
    downstream: ['create_product', 'handle_review'],
    requiredPermissions: ['local_leads'],
  },
  handle_review: {
    taskType: 'handle_review',
    label: AI_TASK_TYPE_LABELS.handle_review,
    phase: 'P4',
    phaseLabel: PHASE_LABEL.P4,
    previewTitle: '评价处理任务',
    previewSteps: [
      '拉取最近差评与中评列表',
      '生成回复草稿（可多条）',
      '展示预览；确认后提交平台或标记已跟进',
    ],
    workflowSteps: [
      '按平台与时间范围拉取差/中评',
      '针对每条生成真诚、合规、可执行的回复草稿',
      '避免承诺无法兑现的补偿；升级项单独标注',
      '生成预览 JSON（actionType: handle_review，confirmRequired: true）',
      '确认后提交或标记跟进，不宣称已公开回复',
    ],
    deliverables: ['回复草稿列表', '跟进状态'],
    downstream: ['analyze_exception'],
    requiredPermissions: ['review'],
  },
  analyze_exception: {
    taskType: 'analyze_exception',
    label: AI_TASK_TYPE_LABELS.analyze_exception,
    phase: 'P5',
    phaseLabel: PHASE_LABEL.P5,
    previewTitle: '异常分析任务',
    previewSteps: [
      '仅针对账号已绑定平台诊断；未绑定平台明确跳过',
      '连锁多门店时覆盖全部已认领门店并汇总，禁止只诊一家',
      '按组品/价格/毛利/评价/销量/客群/竞对/GEO 等维度输出结论',
      '高风险修复须二次确认后再执行',
    ],
    workflowSteps: [
      '先列出本账号已绑定平台与未绑定平台；未绑定平台一律不分析、不编造数据',
      '读取门店范围：若已认领门店≥2（连锁），诊断对象=全部已认领门店；先列清单，再逐店要点，最后连锁汇总；禁止只分析情报里的单店标签',
      '明确异常现象、时间范围；仅在已绑定平台上取数',
      '按维度诊断（有数据给结论，无数据标明缺口与补数入口）：组品、价格、毛利、评价、销量、客群分析、竞争对手分析、Geo 优化分析；可附带同步/审核等技术异常',
      '输出修复 Todo 并映射到对应场景（create_product / sync_platform / handle_review / optimize_local_ads 等）',
      '生成预览 JSON（actionType: analyze_exception，confirmRequired: true）',
      '仅分析+建议；改库/同步须用户在各场景卡片再次确认',
    ],
    deliverables: [
      '绑定平台清单（含跳过项）',
      '门店范围（单店或连锁全店清单）',
      '八维度诊断报告（连锁须含汇总）',
      '根因分类',
      '修复 Todo',
    ],
    downstream: [
      'create_product',
      'generate_copywriting',
      'recruit_influencer',
      'optimize_local_ads',
      'sync_platform',
      'follow_local_lead',
      'handle_review',
    ],
    requiredPermissions: ['product', 'sync'],
  },
  file_tax: {
    taskType: 'file_tax',
    label: AI_TASK_TYPE_LABELS.file_tax,
    phase: 'P6',
    phaseLabel: PHASE_LABEL.P6,
    previewTitle: '一键报税',
    previewSteps: [
      '读取各绑定平台与财务对账核销数据',
      '按申报周期汇总销售额与核销额',
      '展示数据包预览；确认后导出并记录申报状态',
    ],
    workflowSteps: [
      '确认申报周期与涉及平台',
      '汇总销售/核销/退款；标注数据来源与缺口',
      '生成预览 JSON（actionType: file_tax，confirmRequired: true）',
      '确认后导出报税包；不宣称已向税局提交',
    ],
    deliverables: ['报税数据包', '申报记录'],
    downstream: ['analyze_exception', 'create_product'],
    requiredPermissions: ['finance_tax'],
  },
}

/** 闭环主路径（供 LLM 多场景方案参考） */
export const AI_AGENT_CLOSED_LOOP_PATH: AiTaskType[] = [
  'create_product',
  'generate_copywriting',
  'recruit_influencer',
  'optimize_local_ads',
  'sync_platform',
  'follow_local_lead',
  'handle_review',
  'analyze_exception',
  'file_tax',
]

export function getScenarioWorkflow(taskType: AiTaskType): ScenarioWorkflowDef | undefined {
  return AI_AGENT_SCENARIO_WORKFLOWS[taskType]
}

export function isKnownScenarioTaskType(taskType: string | undefined): taskType is AiTaskType {
  if (!taskType) return false
  return Object.prototype.hasOwnProperty.call(AI_AGENT_SCENARIO_WORKFLOWS, taskType)
}

export function buildScenarioPreviewSteps(taskType: AiTaskType, pageLabel?: string): string[] {
  const def = getScenarioWorkflow(taskType)
  if (!def) return pageLabel?.trim() ? [`页面上下文：${pageLabel.trim()}`] : []
  const ctx = pageLabel?.trim() ? [`页面上下文：${pageLabel.trim()}`] : []
  return [...ctx, ...def.previewSteps]
}

export function buildScenarioPreviewTitle(taskType: AiTaskType): string {
  return getScenarioWorkflow(taskType)?.previewTitle ?? AI_TASK_TYPE_LABELS[taskType] ?? '任务预览'
}

/** 注入 LLM 系统提示：单场景工作流 */
export function buildScenarioWorkflowSystemAddon(taskType: AiTaskType): string {
  const def = getScenarioWorkflow(taskType)
  if (!def) return ''
  const downstream = def.downstream.map((t) => AI_TASK_TYPE_LABELS[t]).join('、')
  const steps = def.workflowSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')
  const lines = [
    `【当前场景：${def.label}｜${def.phase} ${def.phaseLabel}】`,
    '须严格按下列工作流推进；写操作仅能通过执行预览 JSON（confirmRequired: true）发起，不得跳过确认。',
    '工作流步骤：',
    steps,
    `交付物：${def.deliverables.join('；')}`,
    downstream ? `完成后可衔接：${downstream}` : '',
    `所需权限：${def.requiredPermissions.join('、')}`,
  ]
  if (taskType === 'analyze_exception') {
    lines.push(
      '【分析异常强制输出结构】',
      '1) 已绑定平台（分析）/ 未绑定平台（跳过，勿编造）',
      '2) 门店范围：单店写店名；连锁（≥2 家已认领）必须列出全部门店清单，并写明「诊断对象=全部 N 家」；禁止只分析其中一家',
      '3) 八维度分节：组品、价格、毛利、评价、销量、客群分析、竞争对手分析、Geo 优化分析（缺数据写「缺口：…」）；连锁须含「逐店要点 + 连锁汇总」',
      '4) 可选：同步失败/审核驳回等技术异常（仅当有情报或用户描述）',
      '5) 修复 Todo（映射下游场景）',
      '6) 需要写操作时再给预览 JSON；禁止只列笼统「六大故障」而不做绑定过滤与维度诊断',
    )
  }
  return lines.filter(Boolean).join('\n')
}

/** 多场景方案时注入闭环说明 */
export function buildClosedLoopSystemAddon(taskTypes: AiTaskType[]): string {
  const uniq = [...new Set(taskTypes)]
  if (uniq.length <= 1) return ''
  const labels = uniq.map((t) => AI_TASK_TYPE_LABELS[t]).join('、')
  const loop = AI_AGENT_CLOSED_LOOP_PATH.map((t) => AI_TASK_TYPE_LABELS[t]).join(' → ')
  return [
    '【多场景闭环】',
    `本方案涉及：${labels}。须先输出完整方案正文，用户回复「确认执行」后，为每个场景分别生成独立预览 JSON（禁止合并到一张卡片）。`,
    `完整经营闭环参考顺序：${loop}。`,
    '分析异常（analyze_exception）可作为路由中枢：按根因跳回对应单场景修复。',
  ].join('\n')
}

/** 九大场景总览（写入主系统提示） */
export function buildNineScenarioOverviewAddon(): string {
  const lines = (Object.values(AI_AGENT_SCENARIO_WORKFLOWS) as ScenarioWorkflowDef[]).map(
    (d) => `- ${d.label}（${d.phase} ${d.phaseLabel}）：${d.previewSteps[0]}`,
  )
  const loop = AI_AGENT_CLOSED_LOOP_PATH.map((t) => AI_TASK_TYPE_LABELS[t]).join(' → ')
  return [
    '【九大场景标准工作流】',
    '用户通过快捷任务或自然语言进入以下场景时，须按对应工作流输出方案与预览 JSON：',
    ...lines,
    '',
    '【统一闭环】',
    loop,
    '分析异常负责诊断并路由回具体场景；一键报税结束周期后可回到创建商品开启新周期。',
  ].join('\n')
}
