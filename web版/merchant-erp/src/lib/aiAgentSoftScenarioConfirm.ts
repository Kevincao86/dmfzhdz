/**
 * AI 助手软场景确认落地（评价 / 同步 / 文案 / 本地推 / 线索 / 异常分析）。
 * 复用各业务页已有 API，确认后给出可核验结果；不宣称未发生的平台动作。
 */
import type { AiTaskType } from './aiAgentTypes'
import { readMerchantSession } from './merchantSession'
import { readStoreMarginConfig } from './storeMarginsRead'
import {
  fetchReviewsList,
  postReviewAiSuggest,
  postReviewReply,
  type ReviewsApiPlatform,
} from '../services/reviewsMerchantApi'
import { syncAllMerchantProductsFromPlatforms } from '../services/merchantProductListApi'
import { generateViralBriefText } from '../services/viralBriefAi'
import { saveMpBriefGenRecord } from '../services/mpBriefGenRecordsClient'
import {
  fetchLocalClues,
  fetchLocalPromotions,
  fetchLocalReportSummary,
  postAdAiInsight,
  postClueAiSuggest,
  postClueCallback,
  updatePromotionStatus,
} from '../services/localPromotionApi'
import { probeMerchantPlatforms } from '../services/platformConnectivityProbe'
import { fetchHomeDashboardByPlatforms } from '../services/merchantDashboardApi'
import { fetchFinanceReconcile } from '../services/financeReconcileApi'
import type { StorePlatformTab } from '../services/merchantStoresApi'

export type SoftScenarioConfirmResult = {
  ok: boolean
  summary: string
  navigateTo?: string
  resultSummary?: 'confirmed' | 'partial'
}

const REVIEW_BATCH_LIMIT = 5
const LEAD_SCRIPT_LIMIT = 3

const REVIEW_PLATFORM_ORDER: Array<{
  api: ReviewsApiPlatform
  tokenKey: string
  label: string
}> = [
  { api: 'douyin', tokenKey: 'meoo_douyin_merchant_token', label: '抖音' },
  { api: 'kuaishou', tokenKey: 'meoo_kuaishou_merchant_token', label: '快手' },
  { api: 'meituan', tokenKey: 'meoo_meituan_merchant_token', label: '美团' },
  { api: 'xhs', tokenKey: 'meoo_xhs_merchant_token', label: '小红书' },
  { api: 'eleme', tokenKey: 'meoo_eleme_merchant_token', label: '淘宝闪购' },
  { api: 'meituan_waimai', tokenKey: 'meoo_meituan_waimai_merchant_token', label: '美团外卖' },
  { api: 'jd_waimai', tokenKey: 'meoo_jd_waimai_merchant_token', label: '京东外卖' },
]

function firstBoundReviewPlatform(): { api: ReviewsApiPlatform; label: string } | null {
  for (const p of REVIEW_PLATFORM_ORDER) {
    if (readMerchantSession(p.tokenKey)) return { api: p.api, label: p.label }
  }
  return null
}

async function confirmHandleReview(title: string): Promise<SoftScenarioConfirmResult> {
  const bound = firstBoundReviewPlatform()
  if (!bound) {
    return {
      ok: false,
      summary: `「${title}」未完成：尚未绑定可拉取评价的平台，请先在系统设置完成授权。`,
      navigateTo: '/settings',
      resultSummary: 'partial',
    }
  }

  const [badRes, neutralRes] = await Promise.all([
    fetchReviewsList(bound.api, 'bad', 'unreplied', { kind: 'store' }),
    fetchReviewsList(bound.api, 'neutral', 'unreplied', { kind: 'store' }),
  ])
  if (!badRes.ok && !neutralRes.ok) {
    const msg = badRes.ok ? neutralRes.message : badRes.message
    return {
      ok: false,
      summary: `「${title}」拉取待回复评价失败（${bound.label}）：${msg}`,
      navigateTo: '/reviews',
      resultSummary: 'partial',
    }
  }

  const pending = [
    ...(badRes.ok ? badRes.items : []),
    ...(neutralRes.ok ? neutralRes.items : []),
  ]
    .filter((r) => !r.replied)
    .slice(0, REVIEW_BATCH_LIMIT)

  if (pending.length === 0) {
    return {
      ok: true,
      summary: `「${title}」已确认。${bound.label} 暂无待回复的差评/中评。可在评价管理继续查看。`,
      navigateTo: '/reviews',
      resultSummary: 'confirmed',
    }
  }

  let okCount = 0
  let failCount = 0
  const failNotes: string[] = []
  for (const row of pending) {
    const sug = await postReviewAiSuggest(bound.api, row.id, row)
    if (!sug.ok) {
      failCount++
      if (failNotes.length < 2) failNotes.push(sug.message)
      continue
    }
    const rep = await postReviewReply(bound.api, row.id, sug.suggestion, row)
    if (!rep.ok) {
      failCount++
      if (failNotes.length < 2) failNotes.push(rep.message)
      continue
    }
    okCount++
  }

  const note = failNotes.length ? ` 失败原因示例：${failNotes.join('；')}` : ''
  if (okCount === 0) {
    return {
      ok: false,
      summary: `「${title}」已尝试回复 ${pending.length} 条（${bound.label}），全部失败。${note}`,
      navigateTo: '/reviews',
      resultSummary: 'partial',
    }
  }
  return {
    ok: true,
    summary: `「${title}」已确认。已对 ${bound.label} 待回复差/中评自动回复：成功 ${okCount} 条，失败 ${failCount} 条。可在评价管理核对。${note}`,
    navigateTo: '/reviews',
    resultSummary: failCount > 0 ? 'partial' : 'confirmed',
  }
}

async function confirmSyncPlatform(title: string): Promise<SoftScenarioConfirmResult> {
  const r = await syncAllMerchantProductsFromPlatforms()
  if (!r.ok) {
    return {
      ok: false,
      summary: `「${title}」同步未完成：${r.message}`,
      navigateTo: '/products/list',
      resultSummary: 'partial',
    }
  }
  return {
    ok: true,
    summary: `「${title}」已确认。平台商品已同步至商品库：${r.message || '完成'}。`,
    navigateTo: '/products/list',
    resultSummary: 'confirmed',
  }
}

async function confirmGenerateCopywriting(
  title: string,
  userBrief: string,
): Promise<SoftScenarioConfirmResult> {
  const brief = userBrief.trim() || '请根据门店主营与近期活动生成可发布的推广种草文案'
  const result = await generateViralBriefText({
    source: {
      title: '推广文案',
      content: brief,
    },
    platform: 'xiaohongshu',
    style: 'deal_push',
    extraHint: '输出可直接发布的图文推广文案',
  })
  const orderId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `copy-${Date.now()}`
  await saveMpBriefGenRecord({
    orderId,
    orderTitle: `AI助手推广文案｜${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    platform: result.platform,
    style: result.style,
    outputMode: result.outputMode,
    resultJson: JSON.stringify(result).slice(0, 120_000),
    fullMarkdown: result.fullMarkdown || result.fullCopy || result.requirementSummary || '',
    idempotencyKey: `ai-agent-copy-${orderId}`,
  })
  const preview =
    (result.fullCopy || result.fullMarkdown || '').trim().slice(0, 280) ||
    result.requirementSummary.slice(0, 280)
  return {
    ok: true,
    summary: `「${title}」已确认。推广文案已生成并入库。摘要：${preview}${preview.length >= 280 ? '…' : ''}。可在 AI 运营 → 内容记录查看全文。`,
    navigateTo: '/ai-operation/content/records',
    resultSummary: 'confirmed',
  }
}

async function confirmOptimizeLocalAds(title: string): Promise<SoftScenarioConfirmResult> {
  const [promoRes, reportRes] = await Promise.all([
    fetchLocalPromotions(),
    fetchLocalReportSummary(),
  ])
  if (!promoRes.ok) {
    return {
      ok: false,
      summary: `「${title}」未完成：${promoRes.message}`,
      navigateTo: '/advertising',
      resultSummary: 'partial',
    }
  }

  const insightRes = await postAdAiInsight({
    summary: reportRes.ok ? reportRes.summary : null,
    promotions: promoRes.list,
    pane: 'ai',
    mode: 'auto_adjust',
  })
  if (!insightRes.ok) {
    return {
      ok: false,
      summary: `「${title}」诊断失败：${insightRes.message}`,
      navigateTo: '/advertising',
      resultSummary: 'partial',
    }
  }

  const actions = (insightRes.actions ?? []).filter(
    (a) => a.promotionId && (a.actionType === 'enable' || a.actionType === 'disable'),
  )
  let applied = 0
  let applyFail = 0
  for (const action of actions.slice(0, 5)) {
    const r = await updatePromotionStatus(
      [action.promotionId!],
      action.actionType === 'enable' ? 'ENABLE' : 'DISABLE',
    )
    if (r.ok) applied++
    else applyFail++
  }

  const insightPreview = insightRes.insight.trim().slice(0, 320)
  const actionLine =
    actions.length === 0
      ? '暂无可安全自动执行的启停建议，请在广告页人工确认。'
      : `已执行启停建议 ${applied} 条${applyFail ? `，失败 ${applyFail} 条` : ''}（仅 enable/disable）。`
  return {
    ok: true,
    summary: `「${title}」已确认。诊断摘要：${insightPreview}${insightRes.insight.length > 320 ? '…' : ''}\n${actionLine}`,
    navigateTo: '/advertising',
    resultSummary: applyFail > 0 ? 'partial' : 'confirmed',
  }
}

async function confirmFollowLocalLead(title: string): Promise<SoftScenarioConfirmResult> {
  const cluesRes = await fetchLocalClues(1)
  if (!cluesRes.ok) {
    return {
      ok: false,
      summary: `「${title}」未完成：${cluesRes.message}`,
      navigateTo: '/leads',
      resultSummary: 'partial',
    }
  }

  const pending = cluesRes.list
    .filter((c) => !c.callbackDone || c.convertState === 'NEW' || !c.convertState)
    .slice(0, LEAD_SCRIPT_LIMIT)

  if (pending.length === 0) {
    return {
      ok: true,
      summary: `「${title}」已确认。当前无待跟进线索（共 ${cluesRes.list.length} 条）。可在线索页继续查看。`,
      navigateTo: '/leads',
      resultSummary: 'confirmed',
    }
  }

  const scripts: string[] = []
  for (const clue of pending) {
    const sug = await postClueAiSuggest({
      name: clue.name,
      phone: clue.phone,
      promotionName: clue.promotionName,
      convertState: clue.convertState,
      convertStateLabel: clue.convertStateLabel,
    })
    if (sug.ok) {
      scripts.push(`【${clue.name || clue.clueId}】${sug.suggestion.trim().slice(0, 160)}`)
    }
  }

  let callbackNote = '未回传状态（仅生成话术）。'
  const first = pending[0]
  if (first) {
    const cb = await postClueCallback({
      clueId: first.clueId,
      convertState: 'CLUE_CONFIRM',
      reasonMessage: 'AI 助手确认跟进：已生成话术，待商家外呼核实',
    })
    callbackNote = cb.ok
      ? `已将首条线索「${first.name || first.clueId}」标记为有意向（未宣称已接通电话）。`
      : `首条线索状态回传失败：${cb.message}`
  }

  const scriptBlock =
    scripts.length > 0 ? `\n跟进话术：\n${scripts.join('\n')}` : '\n未能生成话术，请在线索页重试。'
  return {
    ok: scripts.length > 0,
    summary: `「${title}」已确认。待跟进 ${pending.length} 条。${callbackNote}${scriptBlock}`,
    navigateTo: '/leads',
    resultSummary: scripts.length > 0 ? 'confirmed' : 'partial',
  }
}

async function confirmAnalyzeException(title: string): Promise<SoftScenarioConfirmResult> {
  const [probeRows, finance] = await Promise.all([
    probeMerchantPlatforms(),
    fetchFinanceReconcile({ days: 14 }),
  ])

  const connected = probeRows.filter((r) => r.status === 'connected')
  const unbound = probeRows.filter((r) => r.status !== 'connected')
  const connectedTabs = connected
    .map((r) => r.id as StorePlatformTab)
    .filter((id): id is StorePlatformTab => Boolean(id))

  let dashNote = '看板数据：未拉取（无已连接平台）'
  if (connectedTabs.length > 0) {
    try {
      const dash = await fetchHomeDashboardByPlatforms(connectedTabs, 'day7')
      dashNote = `近7日聚合：成交额约 ¥${Math.round(dash.aggregate.totalRevenue)}，订单 ${dash.aggregate.totalOrders}，待回复评价约 ${dash.aggregate.pendingComments}，新线索约 ${dash.aggregate.todayNewLeads}`
    } catch (e) {
      dashNote = `看板拉取异常：${e instanceof Error ? e.message : String(e)}`
    }
  }

  const margin = readStoreMarginConfig()
  const industryName = margin.industry?.name?.trim() || ''
  const financeNote = finance.ok
    ? `财务对账近14日：${finance.rows.length} 条平台行已聚合`
    : `财务对账缺口：${finance.message}`

  const dims: Array<{ name: string; note: string }> = [
    {
      name: '组品',
      note: connected.length
        ? '已绑定平台可继续在商品库核对在线品；缺明细时请同步平台商品'
        : '缺口：未绑定平台，无法核对组品',
    },
    {
      name: '价格',
      note: finance.ok
        ? '可结合对账核销与商品标价交叉核对；异常价需人工复核'
        : '缺口：对账数据不可用，价格异常待财务接口恢复后重试',
    },
    {
      name: '毛利',
      note: industryName
        ? `行业毛利配置：${industryName}；细项请在财务/报税模块查看`
        : '缺口：未配置门店行业毛利，请在设置中补全',
    },
    {
      name: '评价',
      note: dashNote.includes('待回复评价')
        ? dashNote
        : connected.length
          ? '请打开评价管理查看待回复差/中评'
          : '缺口：无平台绑定，评价不可读',
    },
    {
      name: '销量',
      note: connected.length ? dashNote : '缺口：无平台绑定，销量不可读',
    },
    {
      name: '客群分析',
      note: '缺口：本确认链路仅做只读连通与经营摘要，深度客群需在经营方案页继续',
    },
    {
      name: '竞争对手分析',
      note: '缺口：需情报/竞品数据源；请在经营方案页补充',
    },
    {
      name: 'Geo 优化分析',
      note: '缺口：本链路未拉 Geo 明细；请在经营方案页继续',
    },
  ]

  const boundLine =
    connected.length > 0
      ? `已绑定（分析）：${connected.map((r) => r.name).join('、')}`
      : '已绑定（分析）：无'
  const skipLine =
    unbound.length > 0
      ? `未绑定/异常（跳过，勿编造）：${unbound.map((r) => `${r.name}(${r.status})`).join('、')}`
      : '未绑定/异常：无'
  const dimBlock = dims.map((d) => `- ${d.name}：${d.note}`).join('\n')

  return {
    ok: true,
    summary: [
      `「${title}」已确认（只读诊断，未写库）。`,
      boundLine,
      skipLine,
      financeNote,
      dashNote,
      '八维度摘要：',
      dimBlock,
      '可继续在「经营方案」页深入分析与修复。',
    ].join('\n'),
    navigateTo: '/operation/ai-ops-plan',
    resultSummary: 'confirmed',
  }
}

const SOFT_TASKS = new Set<AiTaskType>([
  'handle_review',
  'sync_platform',
  'generate_copywriting',
  'optimize_local_ads',
  'follow_local_lead',
  'analyze_exception',
])

export function isSoftScenarioTask(taskType: AiTaskType | null | undefined): boolean {
  return Boolean(taskType && SOFT_TASKS.has(taskType))
}

export async function confirmSoftScenarioTask(input: {
  taskType: AiTaskType
  title: string
  userBrief?: string
}): Promise<SoftScenarioConfirmResult> {
  const { taskType, title } = input
  const userBrief = input.userBrief ?? ''
  switch (taskType) {
    case 'handle_review':
      return confirmHandleReview(title)
    case 'sync_platform':
      return confirmSyncPlatform(title)
    case 'generate_copywriting':
      return confirmGenerateCopywriting(title, userBrief)
    case 'optimize_local_ads':
      return confirmOptimizeLocalAds(title)
    case 'follow_local_lead':
      return confirmFollowLocalLead(title)
    case 'analyze_exception':
      return confirmAnalyzeException(title)
    default:
      return {
        ok: false,
        summary: `「${title}」暂不支持自动落地。`,
        resultSummary: 'partial',
      }
  }
}
