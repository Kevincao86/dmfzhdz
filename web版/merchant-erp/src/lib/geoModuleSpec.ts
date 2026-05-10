/**
 * 【模块总览】GEO运营优化（AI本地生活搜索优化）
 *
 * 核心定位：面向本地生活商家的 AI 搜索适配工具，通过标准化门店信息、结构化内容资产，
 * 提升门店在 AI 搜索/问答场景的曝光与转化效率。
 *
 * 核心目标：提升 AI 场景曝光率、消除信息差错、缩短用户转化路径。
 *
 * 本文件为领域常量与纯函数，供 GEO 概览与各子模块复用；接入后端后以接口数据代入计算函数即可。
 */

/** GEO 健康分：综合信息完整度、问法覆盖率、内容新鲜度的加权得分（满分 100） */
export const GEO_HEALTH_SCORE = {
  fullScore: 100,
  /** 建议运营目标 */
  excellentThreshold: 90,
  weight: {
    /** 信息完整度权重 */
    infoCompleteness: 0.4,
    /** 问法覆盖率权重 */
    questionCoverage: 0.35,
    /** 内容新鲜度权重 */
    contentFreshness: 0.25,
  },
} as const

export type GeoHealthInputs = {
  /** 0–100：门店基础信息完善比例 */
  infoCompletenessPercent: number
  /** 0–100：已覆盖高频问法占比 */
  questionCoveragePercent: number
  /** 0–100：内容时效得分（如新近更新=100，超窗递减，由业务侧换算） */
  contentFreshnessPercent: number
}

/**
 * 健康分 = 信息完整度×0.4 + 问法覆盖率×0.35 + 内容新鲜度×0.25
 * 结果四舍五入为整数 0–100
 */
export function computeGeoHealthScore(input: GeoHealthInputs): number {
  const w = GEO_HEALTH_SCORE.weight
  const raw =
    clampPercent(input.infoCompletenessPercent) * w.infoCompleteness +
    clampPercent(input.questionCoveragePercent) * w.questionCoverage +
    clampPercent(input.contentFreshnessPercent) * w.contentFreshness
  return Math.min(GEO_HEALTH_SCORE.fullScore, Math.max(0, Math.round(raw)))
}

function clampPercent(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

/** 信息完整度：门店基础信息完善比例；100% 为最优 */
export const INFO_COMPLETENESS = {
  optimalValue: 100,
  checkFields: [
    'storeName',
    'address',
    'latLng',
    'businessHours',
    'phone',
    'mainDoorImg',
    'parkingInfo',
  ] as const,
  triggerTodoRule: (completenessPercent: number) => completenessPercent < 100,
} as const

/** 问法覆盖率：已覆盖高频问法占比；低于阈值触发查漏补缺 */
export const QUESTION_COVERAGE = {
  warningThreshold: 60,
  triggerTodoRule: (coveragePercent: number) => coveragePercent < 60,
} as const

/** 内容新鲜度：超过 healthyDays 天未更新视为新鲜度不足（结合业务可换算为 0–100 分） */
export const CONTENT_FRESHNESS = {
  healthyDays: 7,
  /** lastUpdateMs：最近一次结构化内容更新时间戳 */
  triggerTodoRule: (lastUpdateMs: number) =>
    Date.now() - lastUpdateMs > CONTENT_FRESHNESS.healthyDays * 24 * 60 * 60 * 1000,
} as const

/** 将「距上次更新天数」粗略映射为 0–100 新鲜度得分（演示用；生产可替换为模型分） */
export function contentFreshnessPercentFromLastUpdate(lastUpdateMs: number): number {
  const ageMs = Date.now() - lastUpdateMs
  if (ageMs <= 0) return 100
  const days = ageMs / (24 * 60 * 60 * 1000)
  if (days <= CONTENT_FRESHNESS.healthyDays) return 100
  const over = days - CONTENT_FRESHNESS.healthyDays
  return Math.max(0, Math.round(100 - over * 12))
}

/** 优化待办：优先级与示例（与 UI 列表、后端任务对齐） */
export const OPTIMIZE_TODO = {
  priority: ['tip', 'warning'] as const,
  action: 'jumpToEditPage' as const,
  examples: [
    '补充门店门头照片',
    '完善停车信息字段',
    '更新7天前的活动内容',
  ] as const,
}

/** 门店信息：字段分组（标准化事实库） */
export const STORE_INFO_FIELDS = {
  baseInfo: ['storeName', 'address', 'latLng', 'businessHours', 'phone'] as const,
  facility: ['parking', 'wifi', 'privateRoom', 'outdoorSeat', 'takeaway'] as const,
  material: ['mainDoorImg', 'environmentImg', 'menuImg'] as const,
  specialRule: ['parkingFee', 'reservationRule', 'holidayBusinessAdjust'] as const,
} as const

export const STORE_INFO_FEATURE = {
  fieldCheck: '必填项+格式校验',
  statusMonitor: '自动识别缺失项，触发待办',
  multiPlatformSync: '支持抖音/美团/大众点评同步',
} as const

/** 内容库类型 */
export const CONTENT_LIBRARY_TYPE = {
  FAQ: '用户高频问题+标准化回答',
  storeSummary: '品牌介绍/特色亮点（AI短引用适配）',
  activity: '促销活动/套餐信息（需实时更新）',
} as const

export const CONTENT_LIBRARY_FEATURE = {
  structuredStorage: '统一格式，适配AI读取',
  freshnessMonitor: '7天未更新触发待办',
  aiAdaptation: '优化表述，提升引用概率',
} as const

/** 问法覆盖能力说明 */
export const QUESTION_COVERAGE_FEATURE = {
  questionLibrary: '本地生活高频问法库（附近XX店/XX店营业吗等）',
  coverageAnalysis: '统计覆盖率，标记未覆盖问法',
  optimizeGuide: '给出未覆盖问法的优化建议',
} as const

/** 口碑证据 */
export const WORD_OF_MOUTH_FEATURE = {
  praiseKeyword: '高赞评论关键词提取（服务好/味道赞等）',
  qualityCase: '用户反馈/打卡笔记沉淀（内容库引用）',
  negativeMonitor: '负面反馈监测，指导运营优化',
} as const

/** 平台同步 */
export const PLATFORM_SYNC_FEATURE = {
  boundPlatform: ['抖音', '美团', '大众点评'] as const,
  oneClickSync: '优化后信息一键同步',
  syncStatus: '同步进度监测，处理失败项',
} as const

/** 效果体检 */
export const EFFECT_CHECK_FEATURE = {
  healthScoreTrend: 'GEO健康分趋势曲线',
  exposureEffect: 'AI场景曝光/引用数据监测',
  optimizeSuggestion: '自动生成优化任务清单',
} as const

/** 待办触发总规则（文案层，与上面 triggerTodoRule 一致） */
export const TODO_TRIGGER_RULE = [
  '信息字段缺失/不完整 → 生成待办',
  '内容超过7天未更新 → 标记「新鲜度不足」待办',
  '问法覆盖率<60% → 触发查漏补缺待办',
] as const

/** AI 引用适配核心规则 */
export const AI_ADAPTATION_RULE =
  '结构化内容优先读取，规范度/更新频率越高，引用优先级越高'
