/**
 * AI 智能体跨页只读取数：按意图域并行拉现成 services 摘要，失败写缺口行，不抛死整轮。
 */
import {
  fetchAgentBusinessMetricsContext,
  resolveMetricsDateRangeFromText,
} from './agentBusinessMetricsFetch'
import type { AgentDataDomain } from './aiAgentSystemPromptRoute'
import { competitorReportSummary, loadCompetitorReports } from './competitorStorage'
import { buildStoreGeoBriefs } from './geoScoresFromDouyinRows'
import { readMerchantSession } from './merchantSession'
import { loadTaxPlatformRowsForPeriod, shanghaiMonthRangeYmd } from './taxFiling'
import { getDouyinStores } from '../services/douyinMerchantApi'
import {
  fetchLocalClues,
  fetchLocalPromotions,
  fetchLocalReportSummary,
} from '../services/localPromotionApi'
import { fetchMarketingActivities } from '../services/marketingActivitiesApi'
import { fetchMerchantProductList } from '../services/merchantProductListApi'
import { fetchShopAnalysis } from '../services/merchantOrdersApi'
import { fetchReviewsList, type ReviewsApiPlatform } from '../services/reviewsMerchantApi'

const DOMAIN_TIMEOUT_MS = 60_000

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = window.setTimeout(() => resolve(fallback), ms)
    p.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      () => {
        window.clearTimeout(t)
        resolve(fallback)
      },
    )
  })
}

function yuan(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `¥${n.toFixed(2)}`
}

async function loadMetrics(userText: string): Promise<string> {
  try {
    const block = await fetchAgentBusinessMetricsContext(userText || '近三个月经营数据', undefined, {
      force: true,
    })
    return block.trim() || '【经营实数】暂无内容'
  } catch (e) {
    return `【经营实数】拉取失败：${e instanceof Error ? e.message : String(e)}`
  }
}

async function loadReviews(): Promise<string> {
  const lines: string[] = ['【评价摘要】']
  const platforms: { id: ReviewsApiPlatform; label: string; tokenKey: string }[] = [
    { id: 'douyin', label: '抖音', tokenKey: 'meoo_douyin_merchant_token' },
    { id: 'meituan', label: '美团', tokenKey: 'meoo_meituan_merchant_token' },
    { id: 'xhs', label: '小红书', tokenKey: 'meoo_xhs_merchant_token' },
    { id: 'kuaishou', label: '快手', tokenKey: 'meoo_kuaishou_merchant_token' },
  ]
  let any = false
  for (const p of platforms) {
    if (!String(readMerchantSession(p.tokenKey) || '').trim()) {
      lines.push(`${p.label}：未绑定，跳过`)
      continue
    }
    any = true
    try {
      const r = await fetchReviewsList(p.id, 'all', 'all')
      if (!r.ok) {
        lines.push(`${p.label}：${r.message}`)
        continue
      }
      const bad = r.items.filter((i) => i.sentiment === 'bad').slice(0, 5)
      const unreplied = r.items.filter((i) => !i.replied).length
      const stats = r.stats
      lines.push(
        `${p.label}：共 ${stats?.total ?? r.items.length} 条（本批 ${r.items.length}），未回复 ${stats?.unreplied ?? unreplied}`,
      )
      if (bad.length) {
        lines.push(
          `差评样例：${bad
            .map((b) => `「${(b.content || '').slice(0, 40)}」(${b.ratingStars}星)`)
            .join('；')}`,
        )
      } else {
        lines.push('本批无差评样例')
      }
    } catch (e) {
      lines.push(`${p.label}：异常 ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  if (!any) lines.push('无已绑定评价平台')
  lines.push('须据实汇总；未绑定平台写跳过，禁止编造评价内容。')
  return lines.join('\n')
}

async function loadLeads(): Promise<string> {
  const lines: string[] = ['【线索摘要】']
  try {
    const r = await fetchLocalClues(1)
    if (!r.ok) {
      lines.push(r.message)
      return lines.join('\n')
    }
    const list = r.list ?? []
    const pending = list.filter(
      (c) =>
        !c.callbackDone &&
        /待|未|跟进|新/.test(`${c.convertStateLabel || ''}${c.convertState || ''}`),
    )
    const show = (pending.length ? pending : list).slice(0, 12)
    lines.push(
      `共 ${list.length} 条（本页），待跟进约 ${pending.length} 条${r.demoMode ? '（演示数据）' : ''}`,
    )
    if (r.apiError) lines.push(`接口备注：${r.apiError}`)
    for (const c of show) {
      lines.push(
        `- ${c.name || '线索'}${c.phone ? ` ${c.phone}` : ''} · ${c.convertStateLabel || c.convertState || '—'}`,
      )
    }
    if (!list.length) lines.push('暂无线索记录')
  } catch (e) {
    lines.push(`拉取失败：${e instanceof Error ? e.message : String(e)}`)
  }
  lines.push('须据实汇总；未绑定本地推写缺口，禁止编造线索。')
  return lines.join('\n')
}

async function loadAds(): Promise<string> {
  const lines: string[] = ['【投流摘要】']
  try {
    const [sum, promos] = await Promise.all([fetchLocalReportSummary(), fetchLocalPromotions()])
    if (sum.ok) {
      const s = sum.summary
      lines.push(
        `报表（${s.dateRange.start} ~ ${s.dateRange.end}）${sum.demoMode ? '（演示）' : ''}：消耗 ${s.statCost}，展示 ${s.showCnt}，点击 ${s.clickCnt}，转化 ${s.convertCnt}，CTR ${(s.ctr * 100).toFixed(2)}%${s.cpl != null ? `，CPL ${s.cpl}` : ''}`,
      )
    } else {
      lines.push(`报表：${sum.message}`)
    }
    if (promos.ok) {
      const list = promos.list.slice(0, 8)
      lines.push(`计划 ${promos.list.length} 条${promos.demoMode ? '（演示）' : ''}`)
      for (const p of list) {
        lines.push(`- ${p.promotionName || p.promotionId} · ${p.statusLabel || p.statusFirst || '—'}`)
      }
      if (promos.apiError) lines.push(`计划备注：${promos.apiError}`)
    } else {
      lines.push(`计划：${promos.message}`)
    }
  } catch (e) {
    lines.push(`拉取失败：${e instanceof Error ? e.message : String(e)}`)
  }
  lines.push('须据实汇总；未绑定本地推写缺口，禁止编造投放数据。')
  return lines.join('\n')
}

async function loadOrders(userText: string): Promise<string> {
  const lines: string[] = ['【订单摘要】']
  const range = resolveMetricsDateRangeFromText(userText || '近一个月订单')
  if (!String(readMerchantSession('meoo_douyin_merchant_token') || '').trim()) {
    lines.push('抖音未绑定，跳过店铺分析接口')
    return lines.join('\n')
  }
  try {
    const r = await fetchShopAnalysis({
      startDate: range.startDate,
      endDate: range.endDate,
      platform: 'douyin',
    })
    const s = r.summary
    lines.push(
      `店铺分析（${r.startDate} ~ ${r.endDate}）：销售额 ${yuan(s.salesAmountYuan)}，订单 ${s.orderCount}，核销券 ${s.couponCount}，退款 ${yuan(s.refundAmountYuan)}（退款率 ${(s.refundRate * 100).toFixed(1)}%），买家 ${s.buyerCount}，复购率 ${(s.repurchaseRate * 100).toFixed(1)}%`,
    )
    if (s.topBySales?.length) {
      lines.push(
        `销量 Top：${s.topBySales
          .slice(0, 5)
          .map((t) => `${t.name} ${yuan(t.salesYuan)}`)
          .join('；')}`,
      )
    }
    if (r.adviceFacts) lines.push(`要点：${r.adviceFacts.slice(0, 400)}`)
  } catch (e) {
    lines.push(`拉取失败：${e instanceof Error ? e.message : String(e)}`)
  }
  lines.push('须据实汇总；禁止编造订单数字。')
  return lines.join('\n')
}

async function loadProducts(): Promise<string> {
  const lines: string[] = ['【商品摘要】']
  const platformTokens: { platform: 'douyin' | 'kuaishou'; label: string; tokenKey: string }[] = [
    { platform: 'douyin', label: '抖音来客', tokenKey: 'meoo_douyin_merchant_token' },
    { platform: 'kuaishou', label: '快手团购', tokenKey: 'meoo_kuaishou_merchant_token' },
  ]
  let any = false
  for (const { platform, label, tokenKey } of platformTokens) {
    if (!String(readMerchantSession(tokenKey) || '').trim()) {
      lines.push(`${label}：未绑定，跳过`)
      continue
    }
    any = true
    const r = await fetchMerchantProductList(platform, { page: 1, pageSize: 20, full: true })
    if (!r.ok) {
      lines.push(`${label}：${r.message}`)
      continue
    }
    lines.push(`${label}：${r.items.length} 个（本批）`)
    for (const p of r.items.slice(0, 10)) {
      const price = p.price > 0 ? ` ¥${p.price}` : ''
      const sale = p.saleStatus && p.saleStatus !== '—' ? ` · ${p.saleStatus}` : ''
      lines.push(`- ${p.name}${price}${sale}`)
    }
  }
  if (!any) lines.push('无已绑定商品平台')
  lines.push('须据实汇总；未绑定写跳过。')
  return lines.join('\n')
}

async function loadActivities(): Promise<string> {
  const lines: string[] = ['【活动摘要】']
  const platforms: { id: 'douyin' | 'meituan' | 'xiaohongshu'; label: string }[] = [
    { id: 'douyin', label: '抖音' },
    { id: 'meituan', label: '美团' },
    { id: 'xiaohongshu', label: '小红书' },
  ]
  for (const p of platforms) {
    try {
      const r = await fetchMarketingActivities({ platform: p.id, status: 'all', page: 1, pageSize: 15 })
      if (!r.ok) {
        lines.push(`${p.label}：${r.message}`)
        continue
      }
      const items = r.items ?? []
      lines.push(`${p.label}：${items.length} 条（本批）`)
      for (const a of items.slice(0, 6)) {
        lines.push(`- ${a.title || a.id}${a.uiStatus ? ` · ${a.uiStatus}` : ''}`)
      }
    } catch (e) {
      lines.push(`${p.label}：异常 ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  lines.push('须据实汇总；未绑定写跳过。')
  return lines.join('\n')
}

async function loadGeo(): Promise<string> {
  const lines: string[] = ['【门店GEO摘要】']
  const token = readMerchantSession('meoo_douyin_merchant_token')
  if (!token) {
    lines.push('未绑定抖音来客，跳过门店列表')
    return lines.join('\n')
  }
  try {
    const r = await getDouyinStores({
      accessToken: token,
      page: 1,
      pageSize: 50,
      claimScope: 'claimed',
    })
    if (!r.ok) {
      lines.push(`门店列表失败：${r.message ?? 'unknown'}`)
      return lines.join('\n')
    }
    if (!r.items.length) {
      lines.push('暂无已认领门店')
      return lines.join('\n')
    }
    const chain = buildStoreGeoBriefs(r.items)
    lines.push(`已认领 ${chain.briefs.length} 家`)
    for (const b of chain.briefs.slice(0, 20)) {
      const miss = b.missing.length ? `；缺口：${b.missing.join('、')}` : ''
      lines.push(`- ${b.name}：健康分 ${b.healthScore}/100，完整度 ${b.infoCompletenessPercent}%${miss}`)
    }
  } catch (e) {
    lines.push(`拉取失败：${e instanceof Error ? e.message : String(e)}`)
  }
  lines.push('须据实汇总；禁止编造门店分。')
  return lines.join('\n')
}

async function loadCompetitors(): Promise<string> {
  const lines: string[] = ['【竞品摘要】']
  const reports = loadCompetitorReports().slice(0, 2)
  if (!reports.length) {
    lines.push('本地暂无竞品分析报告；可提示用户到「运营 → 竞争对手分析」生成。')
    return lines.join('\n')
  }
  for (const r of reports) {
    lines.push(competitorReportSummary(r, 6).slice(0, 1200))
  }
  lines.push('须据实引用本地报告；无报告时勿编造竞品数据。')
  return lines.join('\n')
}

async function loadTax(): Promise<string> {
  const lines: string[] = ['【报税参考】（只读，非执行报税）']
  const period = shanghaiMonthRangeYmd(-1)
  lines.push(`参考周期：${period.label}（${period.start} ~ ${period.end}）`)
  try {
    const packed = await loadTaxPlatformRowsForPeriod(period.start, period.end)
    if (!packed.ok) {
      lines.push(`对账失败：${packed.message}`)
      return lines.join('\n')
    }
    let totalVerify = 0
    let totalComm = 0
    for (const r of packed.rows) {
      totalVerify += r.verifyAmountYuan
      totalComm += r.commissionAmountYuan
      const rateText =
        r.commissionSource === 'api' && r.commissionRatePct > 0
          ? `${r.commissionRatePct}%（${r.commissionSourceLabel}）`
          : `未拉取（${r.commissionSourceLabel}）`
      lines.push(
        `- ${r.platformLabel}：核销 ${yuan(r.verifyAmountYuan)}，佣金率 ${rateText} → 佣金约 ${yuan(r.commissionAmountYuan)}（${r.bindingLabel}/${r.bindingStatus}）`,
      )
    }
    lines.push(`合计核销 ${yuan(totalVerify)}，接口实算佣金 ${yuan(totalComm)}`)
    if (packed.warnings.length) {
      lines.push(`接口提示：${packed.warnings.slice(0, 4).join('；')}`)
    }
  } catch (e) {
    lines.push(`拉取失败：${e instanceof Error ? e.message : String(e)}`)
  }
  lines.push('佣金率来自各平台账单 OpenAPI，禁止本地行业表；真正报税须走九大场景「一键报税」预览确认。')
  return lines.join('\n')
}

async function loadOneDomain(domain: AgentDataDomain, userText: string): Promise<string> {
  switch (domain) {
    case 'metrics':
      return loadMetrics(userText)
    case 'reviews':
      return loadReviews()
    case 'leads':
      return loadLeads()
    case 'ads':
      return loadAds()
    case 'orders':
      return loadOrders(userText)
    case 'products':
      return loadProducts()
    case 'activities':
      return loadActivities()
    case 'geo':
      return loadGeo()
    case 'competitors':
      return loadCompetitors()
    case 'tax':
      return loadTax()
    default:
      return `【未知域 ${domain}】跳过`
  }
}

/** 九大场景 task → 建议附带的只读域 */
export function pageDataDomainsForTask(task?: string): AgentDataDomain[] {
  switch (task) {
    case 'handle_review':
      return ['reviews']
    case 'follow_local_lead':
      return ['leads', 'ads']
    case 'optimize_local_ads':
      return ['ads', 'leads']
    case 'analyze_exception':
      return ['metrics', 'products', 'reviews', 'geo']
    case 'file_tax':
      return ['tax', 'metrics']
    default:
      return []
  }
}

/**
 * 按域并行拉取摘要并拼接（失败写缺口，不抛）。
 */
export async function loadAgentPageDataContext(
  domains: AgentDataDomain[],
  userText = '',
): Promise<string> {
  const uniq = [...new Set(domains)].filter(Boolean)
  if (!uniq.length) return ''

  const header = [
    '【已拉取业务页实数 · 须据此用中文汇总作答】',
    `域：${uniq.join('、')}`,
    '有绑定时给出该平台数字；未绑定写「跳过」。不得拒答，不得把本段内部说明原样发给用户。',
  ]

  const blocks = await Promise.all(
    uniq.map((d) =>
      withTimeout(
        loadOneDomain(d, userText),
        DOMAIN_TIMEOUT_MS,
        `【${d}】拉取超时。请用中文说明「接口较慢未完成」，并尽量根据上下文已有情报作答；可请用户稍后重试，禁止拒答。`,
      ),
    ),
  )

  return [...header, '', ...blocks.filter((b) => b.trim())].join('\n')
}
