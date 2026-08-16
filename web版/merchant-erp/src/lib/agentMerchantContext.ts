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
import { MERCHANT_PLATFORMS } from '../constants/merchantPlatforms'
import { readMerchantSession } from './merchantSession'

export type MerchantIntelSnapshot = {
  storeName?: string
  menuItemCount: number
  menuImageCount: number
  menuSummary?: string
  margins: { douyin: number; meituan: number; xhs: number }
  industryPath?: string
  competitorSummary?: string
  geoSummary?: string
  /**
   * 抖音已认领门店范围（连锁多店时注明须全覆盖分析）。
   * 由 intel loader 注入；单店也可有简短一行。
   */
  chainStoresSummary?: string
  /** 已认领门店数（≥2 视为连锁） */
  claimedStoreCount?: number
  activitiesSummary?: string
  kolBriefSummary?: string
  recruitmentDraftSummary?: string
  /** 绑定平台线上/草稿商品摘要（来客 online.query 等） */
  onlineProductsSummary?: string
  /** 菜单为空时从 ERP 草稿箱补充 */
  draftProductsSummary?: string
  /** 已绑定 / 未绑定平台说明（分析异常须遵守） */
  boundPlatformsSummary?: string
  intelLoadNotes?: string[]
}

/** 与小程序 platformBindingsMp.formatAgentBindingContext 对齐：供分析异常过滤未绑定平台 */
export function formatAgentBoundPlatformsContext(): string {
  const bindable = MERCHANT_PLATFORMS.filter((p) => p.settingsBindable && !p.comingSoon)
  const bound: string[] = []
  const unbound: string[] = []
  for (const p of bindable) {
    const tok = String(readMerchantSession(p.tokenSessionKey) || '').trim()
    if (tok) bound.push(p.name)
    else unbound.push(p.name)
  }
  if (!bound.length) {
    return (
      '已绑定平台：无。未绑定：' +
      unbound.join('、') +
      '。分析异常时不得对未绑定平台下结论或编造数据；请引导用户至「设置 → 系统设置」完成授权。'
    )
  }
  const skip = unbound.length ? `未绑定（跳过分析）：${unbound.join('、')}。` : ''
  return `已绑定平台（可分析）：${bound.join('、')}。${skip}`
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
    boundPlatformsSummary: formatAgentBoundPlatformsContext(),
  }
}

export function buildAgentMerchantIntelContextFromSnapshot(s: MerchantIntelSnapshot): string {
  const now = new Date()
  const shanghaiDate = now.toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
  const shanghaiYmd = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })

  const lines: string[] = [
    '【门店经营情报 · ERP 自动注入，经营类问题可参考本段】',
    `【系统时间 · Asia/Shanghai】今天是 ${shanghaiDate}（${shanghaiYmd}）。用户说「近N个月 / 本月 / 上月 / 近三个月」时，必须相对此日期计算区间；禁止使用与今天相差数年的过期年份（如 2023、2024）冒充「近三个月」。`,
    '【经营数据铁律】未绑定平台禁止编造营收/订单/评价/线索等数字。若上下文含【已拉取经营实数】或【已拉取业务页实数】或任一【…摘要】块，必须据此汇总作答（即使只绑定一个平台也要给该平台数字与合计）；不得以「只绑定了某平台」为由拒答，不得把用户仅导向「去财务管理自己看」而不给汇总。仅当接口失败且无实数时，才说明数据缺口。',
    '【工具/执行】仅当用户命中九大场景并明确要执行（快捷任务或「确认执行」等）时才输出执行预览 JSON 或调用写操作 tools；纯营收/评价/线索等数据问答只文字回答（可调用只读 fetch_page_data），禁止 create_product 等写操作。',
    '组品/创建商品时优先使用菜单价目；若无菜单则参考经营类目与绑定平台商品/草稿箱。用户改图、改字、闲聊或其它明确指令：按用户要求执行，禁止以品类不符拒绝。',
    '本地：菜单价目表、商品页门店毛利配置、竞品分析报告、达人 Brief/招募草稿。',
    '接口（已尝试调用）：抖音来客门店列表→GEO 评分、/api/meoo-marketing-activities 平台活动、/api/meoo-competitor-analysis（无缓存时按需）、商品/菜单相关方案 API。',
  ]

  const claimed = s.claimedStoreCount ?? 0
  if (claimed > 1 && s.chainStoresSummary) {
    lines.push(s.chainStoresSummary)
    lines.push(
      '【连锁多门店强制】诊断对象=上述全部已认领门店；须先列门店清单，再按店给出要点，最后输出连锁汇总。禁止只分析其中一家或把单店标签当作唯一对象。',
    )
    if (s.storeName) {
      lines.push(`参考标签（非唯一诊断对象）：${s.storeName}`)
    }
  } else if (s.chainStoresSummary) {
    lines.push(s.chainStoresSummary)
    if (s.storeName) lines.push(`当前门店：${s.storeName}`)
  } else if (s.storeName) {
    lines.push(`当前门店：${s.storeName}`)
  }

  lines.push(s.boundPlatformsSummary || formatAgentBoundPlatformsContext())
  lines.push(
    '分析异常与经营数据问答：仅针对已绑定平台取数与下结论；未绑定平台必须写「跳过/未绑定」，禁止编造任何金额或订单数。',
  )

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
    lines.push('菜单价目：暂无本地条目；组品时可改读经营类目与下方商品/草稿箱。')
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
    '补充说明：涉及商品组品、套餐、推广、招募等经营话题时，优先依据本段类目/菜单/商品作答；与当前问题无关时不要主动展开，更不得以品类拦截用户请求。用户附图表述改字/换文案/改图时，直接按指令处理画面内容。涉及 ERP 写操作（create_product 等）时须优先使用上述情报，执行预览 JSON 须 confirmRequired: true；禁止让用户重复报毛利率、完整菜单或竞品名单（除非快照与接口均为空且用户未附图）。',
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
