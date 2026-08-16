/**
 * 智能体门店情报异步加载：在本地快照基础上调用 ERP 已对接接口（抖音门店、营销活动、竞品等）。
 */
import type { AiTaskType } from './aiAgentTypes'
import {
  buildAgentMerchantIntelContextFromSnapshot,
  loadMerchantIntelSnapshot,
  type MerchantIntelSnapshot,
} from './agentMerchantContext'
import {
  competitorReportSummary,
  loadCompetitorReports,
  competitorReportKeyForTarget,
  loadSelectedCompetitorTarget,
  saveCompetitorReport,
  type CompetitorReport,
} from './competitorStorage'
import { buildStoreGeoBriefs, computeDeterministicGeoFromStores } from './geoScoresFromDouyinRows'
import { readKolBriefRecords, readSelectedBriefForRecruitment } from './kolBriefStorage'
import { readMerchantSession } from './merchantSession'
import type { MarketingActivityPlatform } from './marketingActivityTypes'
import { tenantLocalKey } from './tenantLocalState'
import { analyzeCompetitors } from '../services/storeIntelApi'
import { fetchMarketingActivities } from '../services/marketingActivitiesApi'
import { getDouyinStores } from '../services/douyinMerchantApi'
import { fetchMerchantProductList } from '../services/merchantProductListApi'
import { resolveCompetitorAnalysisIndustry } from './competitorIndustry'
import { loadAgentPageDataContext, pageDataDomainsForTask } from './agentPageDataLoaders'

const FETCH_TIMEOUT_MS = 45_000

export type MerchantIntelEnrichment = Pick<
  MerchantIntelSnapshot,
  | 'geoSummary'
  | 'chainStoresSummary'
  | 'claimedStoreCount'
  | 'activitiesSummary'
  | 'kolBriefSummary'
  | 'recruitmentDraftSummary'
  | 'competitorSummary'
  | 'onlineProductsSummary'
> & {
  intelLoadNotes?: string[]
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), ms)
    }),
  ])
}

function scopesForTask(task?: AiTaskType): {
  geo: boolean
  activities: boolean
  kol: boolean
  recruitmentDraft: boolean
  competitorRefresh: boolean
  onlineProducts: boolean
} {
  switch (task) {
    case 'create_product':
      return {
        geo: true,
        activities: true,
        kol: false,
        recruitmentDraft: false,
        competitorRefresh: true,
        onlineProducts: true,
      }
    case 'recruit_influencer':
      return {
        geo: false,
        activities: true,
        kol: true,
        recruitmentDraft: true,
        competitorRefresh: false,
        onlineProducts: true,
      }
    case 'generate_copywriting':
      return {
        geo: true,
        activities: true,
        kol: true,
        recruitmentDraft: false,
        competitorRefresh: true,
        onlineProducts: true,
      }
    case 'analyze_exception':
    case 'sync_platform':
      return {
        geo: true,
        activities: true,
        kol: false,
        recruitmentDraft: false,
        competitorRefresh: true,
        onlineProducts: true,
      }
    case 'optimize_local_ads':
    case 'follow_local_lead':
      return {
        geo: true,
        activities: true,
        kol: false,
        recruitmentDraft: false,
        competitorRefresh: false,
        onlineProducts: false,
      }
    default:
      // 日常对话也拉取类目/商品，避免错配组品（如数码店输出餐饮套餐）
      return {
        geo: false,
        activities: false,
        kol: true,
        recruitmentDraft: true,
        competitorRefresh: false,
        onlineProducts: true,
      }
  }
}

async function fetchOnlineProductsSummary(): Promise<{ text?: string; note?: string }> {
  const blocks: string[] = []
  const notes: string[] = []

  const platformTokens: { platform: 'douyin' | 'kuaishou'; label: string; tokenKey: string }[] = [
    { platform: 'douyin', label: '抖音来客', tokenKey: 'meoo_douyin_merchant_token' },
    { platform: 'kuaishou', label: '快手团购', tokenKey: 'meoo_kuaishou_merchant_token' },
  ]

  for (const { platform, label, tokenKey } of platformTokens) {
    if (!String(readMerchantSession(tokenKey) || '').trim()) {
      notes.push(`${label}：未绑定，跳过商品拉取`)
      continue
    }
    const r = await fetchMerchantProductList(platform, { page: 1, pageSize: 30, full: true })
    if (!r.ok) {
      notes.push(`${label}：${r.message}`)
      continue
    }
    if (!r.items.length) {
      const hint = r.message?.trim()
      if (hint) notes.push(`${label}：${hint}`)
      else notes.push(`${label}：线上无商品`)
      continue
    }
    const lines = r.items.slice(0, 12).map((p) => {
      const price = p.price > 0 ? ` ¥${p.price}` : ''
      const sale = p.saleStatus && p.saleStatus !== '—' ? ` · ${p.saleStatus}` : ''
      return `- ${p.name}${price}${sale}`
    })
    blocks.push(`【${label}】${r.items.length} 个\n${lines.join('\n')}`)
  }

  if (blocks.length) return { text: blocks.join('\n\n') }
  return { note: notes.join('；') || '未拉取到绑定平台商品' }
}

async function fetchGeoSummary(): Promise<{
  text?: string
  note?: string
  chainStoresSummary?: string
  claimedStoreCount?: number
}> {
  const token = readMerchantSession('meoo_douyin_merchant_token')
  if (!token) {
    return { note: 'GEO：未绑定抖音来客（/api 门店列表未调用）' }
  }
  try {
    const r = await getDouyinStores({
      accessToken: token,
      page: 1,
      pageSize: 100,
      claimScope: 'claimed',
    })
    if (!r.ok) return { note: `GEO：门店列表接口失败 — ${r.message ?? 'unknown'}` }
    if (!r.items.length) {
      return {
        text: 'GEO：暂无已认领门店，健康分按 0 计',
        claimedStoreCount: 0,
        chainStoresSummary: '门店范围：暂无已认领门店',
      }
    }
    const chain = buildStoreGeoBriefs(r.items)
    const { inputs, querySamples } = computeDeterministicGeoFromStores(r.items)
    const gaps = querySamples.filter((x) => !x.covered).map((x) => x.q)
    const totalHint =
      typeof r.total === 'number' && r.total > r.items.length
        ? `（接口 total=${r.total}，本批已拉 ${r.items.length} 家，以本批为准全覆盖分析）`
        : ''
    const nameList = chain.briefs.map((b) => b.name).join('、')
    const perStoreLines = chain.briefs
      .slice(0, 40)
      .map((b) => {
        const miss = b.missing.length ? `；缺口：${b.missing.join('、')}` : ''
        return `- ${b.name}：健康分 ${b.healthScore}/100，信息完整度 ${b.infoCompletenessPercent}%${miss}`
      })
      .join('\n')
    const more =
      chain.briefs.length > 40 ? `\n…另有 ${chain.briefs.length - 40} 家略（总数 ${chain.storeCount}）` : ''

    const chainStoresSummary = chain.isChain
      ? [
          `门店范围：连锁共 ${chain.storeCount} 家已认领门店${totalHint}`,
          `门店清单：${nameList}`,
          '须对上述全部门店分析后给出连锁汇总，禁止只挑一家。',
        ].join('\n')
      : `门店范围：单店 1 家 — ${chain.briefs[0]?.name || '未命名'}`

    return {
      claimedStoreCount: chain.storeCount,
      chainStoresSummary,
      text: [
        chain.isChain
          ? `GEO 连锁聚合健康分 ${chain.aggregateHealth}/100（共 ${chain.storeCount} 家）`
          : `GEO 健康分 ${chain.aggregateHealth}/100（门店 1 家：${chain.briefs[0]?.name || '—'}）`,
        `聚合维度：信息完整度 ${inputs.infoCompletenessPercent}% · 问法覆盖 ${inputs.questionCoveragePercent}% · 内容新鲜度 ${inputs.contentFreshnessPercent}%`,
        gaps.length ? `未覆盖高频问法：${gaps.join('、')}` : '高频问法均已覆盖',
        chain.isChain ? `逐店 GEO 要点：\n${perStoreLines}${more}` : '',
        '接口：抖音来客门店列表 + 本地 geoModuleSpec 权重计算（与 GEO 运营页同源）',
      ]
        .filter(Boolean)
        .join('\n'),
    }
  } catch (e) {
    return { note: `GEO：拉取异常 — ${e instanceof Error ? e.message : String(e)}` }
  }
}

async function fetchActivitiesSummary(): Promise<{ text?: string; note?: string }> {
  const platforms: MarketingActivityPlatform[] = ['douyin']
  if (readMerchantSession('meoo_meituan_merchant_token')) platforms.push('meituan')
  if (readMerchantSession('meoo_xhs_merchant_token')) platforms.push('xiaohongshu')

  const blocks: string[] = []
  const notes: string[] = []

  await Promise.all(
    platforms.map(async (platform) => {
      const r = await fetchMarketingActivities({ platform, pageSize: 15, status: 'all' })
      if (!r.ok) {
        notes.push(`活动(${platform})：${r.message}`)
        return
      }
      const pick = r.items
        .filter((it) => it.uiStatus === 'ongoing' || it.uiStatus === 'enrollable')
        .slice(0, 6)
      if (!pick.length) {
        blocks.push(`【${platform}】暂无可报名/进行中活动`)
        return
      }
      blocks.push(
        `【${platform}】${pick
          .map(
            (a) =>
              `${a.title}（${a.uiStatus}${a.endAt ? `，至 ${a.endAt.slice(0, 10)}` : ''}）${a.summary ? ` — ${a.summary.slice(0, 100)}` : ''}`,
          )
          .join('\n')}`,
      )
    }),
  )

  if (blocks.length) return { text: `平台营销活动（/api/meoo-marketing-activities）：\n${blocks.join('\n\n')}` }
  return { note: notes.join('；') || '活动：各平台均无数据或未绑定' }
}

function loadRecruitmentDraftSummary(): string | undefined {
  try {
    const raw = window.localStorage.getItem(tenantLocalKey('meoo_recruitment_create_draft_v1'))
    if (!raw) return undefined
    const d = JSON.parse(raw) as Record<string, unknown>
    const name = String(d.name ?? '').trim()
    if (!name) return undefined
    const stores = Array.isArray(d.stores) ? (d.stores as { name?: string }[]) : []
    const storeLine = stores
      .map((s) => s.name)
      .filter(Boolean)
      .slice(0, 5)
      .join('、')
    return [
      `达人招募草稿：${name}`,
      `模式：${d.recruitMode === 'designated' ? '指定达人' : 'AI 分配'}`,
      `平台：${Array.isArray(d.platforms) ? (d.platforms as string[]).join('、') : '—'}`,
      `佣金率：${d.merchantCommissionPct ?? '—'}%`,
      storeLine ? `门店：${storeLine}` : '',
      typeof d.note === 'string' && d.note.trim() ? `备注：${d.note.trim().slice(0, 200)}` : '',
    ]
      .filter(Boolean)
      .join('；')
  } catch {
    return undefined
  }
}

function loadKolBriefSummary(): string | undefined {
  const selected = readSelectedBriefForRecruitment()
  if (selected) {
    return `已选达人 Brief：${selected.mainProductName}（${selected.platform}）标签 ${selected.tags.join('、')}；正文节选：${selected.text.slice(0, 280)}`
  }
  const rows = readKolBriefRecords().slice(0, 3)
  if (!rows.length) return undefined
  return `达人 Brief 库（近 ${rows.length} 条）：${rows.map((r) => `${r.mainProductName}（${r.platform}）`).join('；')}`
}

async function maybeRefreshCompetitorReport(
  base: MerchantIntelSnapshot,
): Promise<{ summary?: string; note?: string }> {
  if (base.competitorSummary) return { summary: base.competitorSummary }
  const sel = loadSelectedCompetitorTarget()
  if (!sel) {
    return { note: '竞品：未选分析门店/品牌，请到「运营 → 竞争对手分析」选择并分析' }
  }
  const address = sel.mode === 'brand' ? sel.anchorAddress : sel.address
  if (!address?.trim()) {
    return { note: '竞品：未选分析门店/品牌，请到「运营 → 竞争对手分析」选择并分析' }
  }
  const label = sel.mode === 'brand' ? sel.brandName : sel.storeName
  const industry = resolveCompetitorAnalysisIndustry(label)
  const menuSummary = base.menuSummary
  try {
    const r = await analyzeCompetitors({
      storeName: label,
      address,
      city: sel.mode === 'brand' ? sel.anchorCity : sel.city,
      industryPath: industry.path || undefined,
      industryName: industry.name || undefined,
      industryHint: industry.path || undefined,
      menuSummary,
      analysisMode: sel.mode,
      brandName: sel.mode === 'brand' ? sel.brandName : undefined,
      storeCount: sel.mode === 'brand' ? sel.storeCount : undefined,
      storeLocations:
        sel.mode === 'brand'
          ? sel.stores.map((s) => `${s.storeName}：${s.address}`).join('\n')
          : undefined,
    })
    if (!r.ok) return { note: `竞品：/api/meoo-competitor-analysis 失败 — ${r.message}` }
    const report: CompetitorReport = {
      id: `cmp-agent-${Date.now()}`,
      poiId: competitorReportKeyForTarget(sel),
      storeName: label,
      address,
      brandName: sel.mode === 'brand' ? sel.brandName : undefined,
      storeCount: sel.mode === 'brand' ? sel.storeCount : undefined,
      industryHint: industry.path || r.industryHint,
      analyzedAt: new Date().toISOString(),
      summary: r.summary,
      competitors: r.competitors,
      suggestions: r.suggestions,
    }
    saveCompetitorReport(report)
    return { summary: competitorReportSummary(report) }
  } catch (e) {
    return { note: `竞品：分析接口异常 — ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** 拉取最新竞品列表（本地已保存的多条报告） */
function allCompetitorReportsSummary(): string | undefined {
  const reports = loadCompetitorReports().slice(0, 2)
  if (!reports.length) return undefined
  return reports.map((r) => competitorReportSummary(r, 5)).join('\n---\n')
}

export async function fetchMerchantIntelEnrichment(
  base: MerchantIntelSnapshot,
  taskType?: AiTaskType,
): Promise<MerchantIntelEnrichment> {
  const scope = scopesForTask(taskType)
  const notes: string[] = []
  const out: MerchantIntelEnrichment = {}

  const jobs: Promise<void>[] = []

  if (scope.geo) {
    jobs.push(
      withTimeout(fetchGeoSummary(), FETCH_TIMEOUT_MS, { note: 'GEO：请求超时' }).then((g) => {
        if (g.text) out.geoSummary = g.text
        else if (g.note) notes.push(g.note)
        if (g.chainStoresSummary) out.chainStoresSummary = g.chainStoresSummary
        if (typeof g.claimedStoreCount === 'number') out.claimedStoreCount = g.claimedStoreCount
      }),
    )
  }

  if (scope.activities) {
    jobs.push(
      withTimeout(fetchActivitiesSummary(), FETCH_TIMEOUT_MS, { note: '活动：请求超时' }).then((a) => {
        if (a.text) out.activitiesSummary = a.text
        else if (a.note) notes.push(a.note)
      }),
    )
  }

  if (scope.kol) {
    const kol = loadKolBriefSummary()
    if (kol) out.kolBriefSummary = kol
  }

  if (scope.recruitmentDraft) {
    const draft = loadRecruitmentDraftSummary()
    if (draft) out.recruitmentDraftSummary = draft
  }

  if (scope.competitorRefresh) {
    jobs.push(
      withTimeout(maybeRefreshCompetitorReport(base), FETCH_TIMEOUT_MS, { note: '竞品：请求超时' }).then(
        (c) => {
          if (c.summary) out.competitorSummary = c.summary
          else if (c.note) notes.push(c.note)
        },
      ),
    )
  } else {
    const multi = allCompetitorReportsSummary()
    if (multi && !base.competitorSummary) out.competitorSummary = multi
  }

  if (scope.onlineProducts) {
    jobs.push(
      withTimeout(fetchOnlineProductsSummary(), FETCH_TIMEOUT_MS, { note: '商品：请求超时' }).then((p) => {
        if (p.text) out.onlineProductsSummary = p.text
        else if (p.note) notes.push(p.note)
      }),
    )
  }

  await Promise.all(jobs)

  if (!out.competitorSummary && base.competitorSummary) {
    out.competitorSummary = base.competitorSummary
  }

  if (notes.length) out.intelLoadNotes = notes
  return out
}

export async function loadFullMerchantIntelSnapshot(
  taskType?: AiTaskType,
): Promise<MerchantIntelSnapshot> {
  const base = loadMerchantIntelSnapshot()
  const enriched = await fetchMerchantIntelEnrichment(base, taskType)
  return { ...base, ...enriched }
}


export async function buildAgentMerchantIntelContextAsync(
  taskType?: AiTaskType,
): Promise<string> {
  const full = await loadFullMerchantIntelSnapshot(taskType)
  let text = buildAgentMerchantIntelContextFromSnapshot(full)
  const domains = pageDataDomainsForTask(taskType)
  if (domains.length) {
    try {
      const pageBlock = await loadAgentPageDataContext(domains, '')
      if (pageBlock.trim()) text = `${text}\n\n${pageBlock}`
    } catch {
      text = `${text}\n\n【已拉取业务页实数】场景附带拉数失败，请据绑定说明告知缺口，禁止编造。`
    }
  }
  return text
}
