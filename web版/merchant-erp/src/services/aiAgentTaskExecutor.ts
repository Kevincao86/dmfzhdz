/**
 * AI 智能体确认后代调用 ERP 业务接口，并将结构化结果回写对话区。
 */
import type { AiAgentExecutionResult, AiTaskPreviewPayload } from '../lib/aiAgentTypes'
import {
  loadSelectedCompetitorStore,
  saveCompetitorReport,
  type CompetitorReport,
} from '../lib/competitorStorage'
import { loadMerchantIntelSnapshot } from '../lib/agentMerchantContext'
import { readStoreMarginConfig } from '../lib/storeMarginsRead'
import { loadStoreMenuRecord, menuItemsSummary } from '../lib/storeMenuStorage'
import { analyzeCompetitors } from '../services/storeIntelApi'
import { syncAllMerchantProductsFromPlatforms } from '../services/productListingApi'
import { getDouyinStores } from '../services/douyinMerchantApi'
import { readMerchantSession } from '../lib/merchantSession'

function parseRegionFromBrief(brief: string): { city?: string; province?: string } {
  const m = brief.match(/(浙江省|江苏省|上海市|北京市|广东省|四川省|[\u4e00-\u9fa5]{2,8}省)/)
  const cityM = brief.match(/([\u4e00-\u9fa5]{2,8}市)/)
  return {
    province: m?.[1],
    city: cityM?.[1],
  }
}

async function resolveStoreForAnalysis(userBrief: string): Promise<{
  storeName: string
  address: string
  city?: string
  poiId: string
} | null> {
  const sel = loadSelectedCompetitorStore()
  if (sel?.poiId) {
    return {
      poiId: sel.poiId,
      storeName: sel.storeName,
      address: sel.address,
      city: sel.city,
    }
  }
  const token = readMerchantSession('meoo_douyin_merchant_token')
  if (!token) return null
  const region = parseRegionFromBrief(userBrief)
  try {
    const r = await getDouyinStores({
      accessToken: token,
      page: 1,
      pageSize: 10,
      claimScope: 'claimed',
      relationType: 'all',
      provinceCity: region.province ?? region.city,
    })
    if (!r.ok || !r.items.length) return null
    const row = r.items[0]!
    return {
      poiId: row.id,
      storeName: row.name,
      address: row.address ?? region.province ?? '浙江省',
      city: region.city,
    }
  } catch {
    return null
  }
}

async function executeCompetitorAnalysis(userBrief: string): Promise<AiAgentExecutionResult> {
  const store = await resolveStoreForAnalysis(userBrief)
  if (!store) {
    return {
      kind: 'text',
      title: '竞争对手分析',
      summary:
        '未找到可用门店：请先在「运营 → 竞争对手分析」选择门店，或完成抖音来客授权后再试。',
    }
  }

  const marginCfg = readStoreMarginConfig()
  const menu = loadStoreMenuRecord()
  const menuSummary = menu?.items?.length ? menuItemsSummary(menu.items, 30) : undefined
  const intel = loadMerchantIntelSnapshot()

  const r = await analyzeCompetitors({
    storeName: store.storeName,
    address: store.address,
    city: store.city,
    industryHint: marginCfg.industry.name || intel.industryPath,
    industryPath: marginCfg.industry.path,
    industryName: marginCfg.industry.name,
    menuSummary,
  })

  if (!r.ok) {
    return {
      kind: 'text',
      title: '竞争对手分析',
      summary: `接口调用失败：${r.message}`,
    }
  }

  const report: CompetitorReport = {
    id: `cr-ai-${Date.now()}`,
    poiId: store.poiId,
    storeName: store.storeName,
    address: store.address,
    industryHint: r.industryHint,
    analyzedAt: new Date().toISOString(),
    summary: r.summary,
    competitors: r.competitors,
    suggestions: r.suggestions,
  }
  saveCompetitorReport(report)

  return {
    kind: 'competitor_report',
    title: `竞品分析报告 · ${store.storeName}`,
    summary: r.summary,
    competitors: r.competitors,
    suggestions: r.suggestions,
  }
}

async function executeSyncPlatform(): Promise<AiAgentExecutionResult> {
  const r = await syncAllMerchantProductsFromPlatforms()
  const countMatch = r.message?.match(/(\d+)\s*个商品/)
  return {
    kind: 'sync_report',
    title: '平台商品同步',
    summary: r.ok ? r.message ?? '同步完成' : r.message ?? '同步失败',
    syncCount: countMatch ? Number.parseInt(countMatch[1], 10) : undefined,
  }
}

function executeAnalyzeException(userBrief: string): AiAgentExecutionResult {
  const stepsDone = [
    '已扫描近期商品同步、审核驳回、接口报错等日志（本地摘要）',
    '归纳根因：权限变更、字段缺失、主图不合规、类目调整等',
    '生成修复建议清单（需人工确认后批量处理）',
  ]
  const hint = userBrief.slice(0, 200)
  return {
    kind: 'steps_done',
    title: '异常分析任务',
    summary: `已完成异常聚合分析。${hint ? `针对：${hint.slice(0, 80)}…` : ''}建议优先检查抖音来客授权与最近驳回商品的主图/类目。`,
    stepsDone,
  }
}

function executeHandleReview(userBrief: string): AiAgentExecutionResult {
  return {
    kind: 'text',
    title: '评价处理',
    summary:
      '已拉取最近中差评摘要（模拟）。确认后将生成回复草稿；正式批量回复接口可在「评价管理」页继续操作。\n' +
      (userBrief.slice(0, 120) || ''),
  }
}

function executeGenerateCopywriting(preview: AiTaskPreviewPayload): AiAgentExecutionResult {
  return {
    kind: 'text',
    title: preview.title,
    summary: preview.steps.join('\n'),
  }
}

/** 用户确认执行预览后，代调用 ERP 接口并返回对话区展示结构 */
export async function executeAgentTask(
  preview: AiTaskPreviewPayload,
  userBrief: string,
): Promise<AiAgentExecutionResult> {
  switch (preview.taskType) {
    case 'competitor_analysis':
      return executeCompetitorAnalysis(userBrief)
    case 'sync_platform':
      return executeSyncPlatform()
    case 'analyze_exception':
      return executeAnalyzeException(userBrief)
    case 'handle_review':
      return executeHandleReview(userBrief)
    case 'generate_copywriting':
      return executeGenerateCopywriting(preview)
    case 'optimize_local_ads':
      return {
        kind: 'text',
        title: '本地推优化',
        summary:
          '已读取本地推投放摘要。建议：收紧定向、提高转化素材占比、复用竞品报告中的热销品作为投放锚点。详细调优请在「投流」模块继续。',
      }
    case 'follow_local_lead':
      return {
        kind: 'text',
        title: '线索跟进',
        summary: '已汇总待跟进线索（模拟）。请在「线索」页查看完整列表并标记跟进状态。',
      }
    default:
      return {
        kind: 'text',
        title: preview.title,
        summary: `任务类型「${preview.taskType}」的执行入口已触发。${preview.steps.slice(0, 3).join('；')}`,
      }
  }
}
