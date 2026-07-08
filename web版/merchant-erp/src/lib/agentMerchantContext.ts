/**
 * 智能体 / 商品方案共用的门店数据快照：菜单、毛利率、竞品、GEO、平台活动等。
 */
import {
  competitorReportSummary,
  competitorDisplayLabel,
  latestCompetitorReportForTarget,
  loadCompetitorReports,
  loadSelectedCompetitorTarget,
} from './competitorStorage'
import { loadStoreMenuRecord, menuItemsSummary } from './storeMenuStorage'
import { readStoreMarginConfig } from './storeMarginsRead'
import { loadProductEditLibraryDraftBriefPicks } from './productEditLibrary'
import { formatIndustryAlignmentConstraint, summarizeDraftProductPicks } from './merchantIndustryAlign'

export type MerchantIntelSnapshot = {
  storeName?: string
  menuItemCount: number
  menuImageCount: number
  menuSummary?: string
  margins: { douyin: number; meituan: number; xhs: number }
  industryPath?: string
  competitorSummary?: string
  geoSummary?: string
  activitiesSummary?: string
  kolBriefSummary?: string
  recruitmentDraftSummary?: string
  /** 绑定平台线上/草稿商品摘要（来客 online.query 等） */
  onlineProductsSummary?: string
  /** 菜单为空时从 ERP 草稿箱补充 */
  draftProductsSummary?: string
  intelLoadNotes?: string[]
}

export function loadMerchantIntelSnapshot(): MerchantIntelSnapshot {
  const marginCfg = readStoreMarginConfig()
  const menu = loadStoreMenuRecord()
  const sel = loadSelectedCompetitorTarget()
  const cmp = latestCompetitorReportForTarget(sel)
  const fallbackCmp =
    !cmp && loadCompetitorReports()[0] ? competitorReportSummary(loadCompetitorReports()[0]) : undefined
  const items = menu?.items ?? []
  const images = menu?.images ?? []
  const menuSummary = items.length ? menuItemsSummary(items, 40) : undefined
  const draftPicks = items.length ? [] : loadProductEditLibraryDraftBriefPicks(24)
  const draftProductsSummary = items.length ? undefined : summarizeDraftProductPicks(draftPicks)

  return {
    storeName: (sel ? competitorDisplayLabel(sel) : undefined) ?? menu?.storeName,
    menuItemCount: items.length,
    menuImageCount: images.length,
    menuSummary,
    draftProductsSummary,
    margins: marginCfg.margins,
    industryPath: marginCfg.industry.path || marginCfg.industry.name || undefined,
    competitorSummary: cmp ? competitorReportSummary(cmp) : fallbackCmp,
  }
}

export function buildAgentMerchantIntelContextFromSnapshot(s: MerchantIntelSnapshot): string {
  const lines: string[] = [
    '【门店经营情报 · ERP 自动注入，回复前须先阅读本段】',
    '优先使用菜单价目；若无菜单则使用经营类目与绑定平台商品/草稿箱；所有组品须与类目一致。',
    '本地：菜单价目表、商品页门店毛利配置、竞品分析报告、达人 Brief/招募草稿。',
    '接口（已尝试调用）：抖音来客门店列表→GEO 评分、/api/meoo-marketing-activities 平台活动、/api/meoo-competitor-analysis（无缓存时按需）、商品/菜单相关方案 API。',
  ]

  if (s.storeName) lines.push(`当前门店：${s.storeName}`)

  lines.push(
    `综合毛利率（%）：抖音 ${s.margins.douyin}，美团 ${s.margins.meituan}，小红书 ${s.margins.xhs}（商品板块已保存，定价与套餐须据此倒推）。`,
  )
  if (s.industryPath) lines.push(`经营类目：${s.industryPath}`)

  if (s.menuSummary) {
    lines.push(`菜单价目（${s.menuItemCount} 项）：\n${s.menuSummary}`)
  } else if (s.menuImageCount > 0) {
    lines.push(
      `菜单价目：已上传 ${s.menuImageCount} 张图，条目未识别；可结合用户附图，或提示至「店铺 → 菜单价目表」识别。`,
    )
  } else {
    lines.push('菜单价目：暂无本地条目；须改读经营类目与下方商品/草稿箱，禁止默认按餐饮举例。')
  }

  if (s.draftProductsSummary) {
    const label = s.menuItemCount ? '补充' : '菜单为空，以此为准'
    lines.push(`ERP 商品草稿箱（${label}）：\n${s.draftProductsSummary}`)
  }

  if (s.competitorSummary) {
    lines.push(`竞争对手分析：\n${s.competitorSummary.slice(0, 1500)}`)
  }

  if (s.geoSummary) {
    lines.push(`GEO 运营优化：\n${s.geoSummary}`)
  }

  if (s.activitiesSummary) {
    lines.push(s.activitiesSummary)
  }

  if (s.kolBriefSummary) {
    lines.push(`达人种草 Brief：${s.kolBriefSummary}`)
  }

  if (s.recruitmentDraftSummary) {
    lines.push(s.recruitmentDraftSummary)
  }

  if (s.onlineProductsSummary) {
    lines.push(`绑定平台商品（线上/草稿）：\n${s.onlineProductsSummary}`)
  }

  if (s.intelLoadNotes?.length) {
    lines.push(`接口备注：${s.intelLoadNotes.join('；')}`)
  }

  lines.push(formatIndustryAlignmentConstraint(s.industryPath, s.storeName))

  lines.push(
    '补充说明：涉及商品组品、套餐、推广、招募等经营话题时，必须先依据本段类目/菜单/商品作答；与当前问题无关时不要主动展开。涉及 ERP 写操作（create_product 等）时须优先使用上述情报，执行预览 JSON 须 confirmRequired: true；禁止让用户重复报毛利率、完整菜单或竞品名单（除非快照与接口均为空且用户未附图）。',
  )

  return lines.join('\n')
}

/** 同步块（无接口拉取）；对话发送前请用 agentMerchantIntelLoader.buildAgentMerchantIntelContextAsync */
export function buildAgentMerchantIntelContext(): string {
  return buildAgentMerchantIntelContextFromSnapshot(loadMerchantIntelSnapshot())
}

/** 商品方案 API 请求体（含竞品/菜单；GEO/活动写入 userBrief 补充段） */
export function merchantIntelForProductPlanApi(
  userBrief: string,
  intel?: MerchantIntelSnapshot,
): {
  userBrief: string
  platform: string
  storeName?: string
  menuSummary?: string
  margins: { douyin: number; meituan: number; xhs: number }
  industryPath?: string
  competitorSummary?: string
} {
  const s = intel ?? loadMerchantIntelSnapshot()
  const briefParts = [userBrief]
  if (s.geoSummary) briefParts.push(`[GEO]\n${s.geoSummary.slice(0, 600)}`)
  if (s.activitiesSummary) briefParts.push(`[活动]\n${s.activitiesSummary.slice(0, 600)}`)
  return {
    userBrief: briefParts.join('\n\n'),
    platform: 'douyin',
    storeName: s.storeName,
    menuSummary: s.menuSummary,
    margins: s.margins,
    industryPath: s.industryPath,
    competitorSummary: s.competitorSummary,
  }
}

export function merchantIntelStatusLine(intel?: MerchantIntelSnapshot): string {
  const s = intel ?? loadMerchantIntelSnapshot()
  const parts: string[] = []
  const menuPart = s.menuItemCount
    ? `菜单 ${s.menuItemCount} 项`
    : s.menuImageCount
      ? `菜单图 ${s.menuImageCount} 张`
      : '菜单未录入'
  parts.push(menuPart)
  parts.push(`毛利 抖${s.margins.douyin}%`)
  if (s.competitorSummary) parts.push('竞品已接入')
  if (s.geoSummary) parts.push('GEO已拉取')
  if (s.activitiesSummary) parts.push('活动已拉取')
  return `已读取：${parts.join(' · ')}`
}
