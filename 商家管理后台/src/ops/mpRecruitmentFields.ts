import {
  filterRecruitmentInfoLines,
  filterRecruitmentInfoText,
  filterTaskDetailText,
  normalizeRecruitmentPlatform,
  shouldExcludeRecruitmentSegment,
  type RecruitmentPlatform,
} from '../meooRegistryShared/recruitmentInfoFilter.js'
import type { RegistryMpRecruitmentOrder, RegistryRecruitmentOrder } from './opsRegistryApi'

function pickField(summary: string, key: string): string {
  const re = new RegExp(`${key}[:：]([^；;]+)`)
  const m = summary.match(re)
  return m ? m[1].trim() : ''
}

function parseRecruitCount(summary: string, fallbackFans: number): number {
  const tier = summary.match(/档位[:：]([^；;]+)/)
  if (tier) {
    const nums = tier[1].match(/V\d+[:：]?\s*(\d+)/gi) || []
    let sum = 0
    for (const n of nums) {
      const v = Number(n.replace(/\D/g, ''))
      if (Number.isFinite(v)) sum += v
    }
    if (sum > 0) return sum
  }
  if (fallbackFans > 0 && fallbackFans < 500) return fallbackFans
  return 0
}

/** 从商家达人招募订单生成小程序单展示字段 */
export function buildMpRecruitmentFieldsFromMerchant(
  order: RegistryRecruitmentOrder,
  opts?: { platform?: RecruitmentPlatform; urgent?: boolean },
): Pick<
  RegistryMpRecruitmentOrder,
  | 'title'
  | 'recruitmentInfo'
  | 'taskDetail'
  | 'merchantRequirements'
  | 'platform'
  | 'fansRequirement'
  | 'budgetText'
  | 'recruitCount'
  | 'region'
  | 'category'
  | 'serviceAmount'
  | 'urgent'
> {
  const summary = String(order.infoSummary || '').trim()
  const region = pickField(summary, '城市') || order.storeName || order.storeAddress || '—'
  const category = pickField(summary, '行业') || order.category || '本地生活'
  const platform = normalizeRecruitmentPlatform(
    opts?.platform || order.recruitmentPlatform || order.accountType,
  )
  const budget = Math.max(0, order.serviceAmount || 0)
  const budgetText = budget > 0 ? `¥${budget.toLocaleString('zh-CN')}` : '面议'
  const recruitCount = parseRecruitCount(summary, order.fans) || (order.fans > 0 ? order.fans : 1)
  const fansRequirement = order.fans >= 5000 ? `≥${order.fans.toLocaleString('zh-CN')}` : '≥5000'

  const recruitmentLines: string[] = []
  const taskLines: string[] = []
  if (summary) {
    const parts = summary.split(/[；;]/).map((p) => p.trim()).filter(Boolean)
    for (const p of parts) {
      if (shouldExcludeRecruitmentSegment(p)) continue
      if (/套餐|探店|策略|档位|佣金|招募[:：]|城市|行业|时段|达人|粉丝|带货|营销|佣金/.test(p)) {
        recruitmentLines.push(p)
      } else if (/说明|交付|备注|要求|结算|出片|组/.test(p)) {
        taskLines.push(p)
      } else {
        recruitmentLines.push(p)
      }
    }
  }
  const filteredRecruitment = filterRecruitmentInfoLines(recruitmentLines)
  if (!filteredRecruitment.length && summary) {
    const fallback = filterRecruitmentInfoText(summary)
    if (fallback) recruitmentLines.push(...fallback.split('\n'))
    else recruitmentLines.length = 0
  } else {
    recruitmentLines.length = 0
    recruitmentLines.push(...filteredRecruitment)
  }
  if (!taskLines.length && order.storeAddress && order.storeAddress !== '—') {
    taskLines.push(`门店/地址：${order.storeAddress}`)
  }

  const title =
    pickField(summary, '套餐') && pickField(summary, '套餐') !== '—'
      ? `${region}${category}${platform}招募`
      : `${order.customerName}·${order.storeName}${category}招募`

  const merchantRequirements =
    summary ||
    `${order.customerName} · ${order.storeName} 达人招募（预算约 ${budgetText}）`

  const urgentAuto =
    /急单|紧急|加急|尽快|48\s*小时|24\s*小时|当日|明天探店/.test(summary) || budget >= 3000
  const urgent = typeof opts?.urgent === 'boolean' ? opts.urgent : urgentAuto

  return {
    title,
    recruitmentInfo: recruitmentLines.join('\n'),
    taskDetail: filterTaskDetailText(taskLines.length ? taskLines.join('\n') : merchantRequirements),
    merchantRequirements,
    platform,
    fansRequirement,
    budgetText,
    recruitCount,
    region,
    category,
    serviceAmount: budget,
    urgent,
  }
}

/** 云剪单：从商家云剪招募订单生成小程序展示字段 */
export function buildMpRecruitmentFieldsForIce(
  order: RegistryRecruitmentOrder,
): Pick<
  RegistryMpRecruitmentOrder,
  | 'title'
  | 'recruitmentInfo'
  | 'taskDetail'
  | 'merchantRequirements'
  | 'platform'
  | 'fansRequirement'
  | 'budgetText'
  | 'recruitCount'
  | 'region'
  | 'category'
  | 'serviceAmount'
  | 'urgent'
> {
  const n = Math.max(1, order.iceVideoCount ?? order.iceVideoSlots?.length ?? 1)
  const brief = String(order.infoSummary || '').trim()
  const platform = normalizeRecruitmentPlatform(order.recruitmentPlatform || order.accountType)
  return {
    title: `${order.customerName}·云剪投放（${n} 条成片）`,
    recruitmentInfo: `订单类型：云剪（招募、云剪）\n云剪视频数量：${n}\n${brief ? brief.slice(0, 800) : ''}`.trim(),
    taskDetail:
      '有素材仅发布：认领后系统分配一条云剪成片下载链接；发布至抖音后在本页回传作品链接，AI 自动核查。全部达人通过后进入待结算。',
    merchantRequirements: brief || `云剪批量投放 ${n} 条，需 ${n} 位达人各发布 1 条抖音作品。`,
    platform,
    fansRequirement: '按云剪任务认领',
    budgetText: order.serviceAmount > 0 ? `¥${order.serviceAmount.toLocaleString('zh-CN')}` : '云剪投放',
    recruitCount: n,
    region: order.storeName || '—',
    category: order.category || '云剪投放',
    serviceAmount: order.serviceAmount,
    urgent: false,
  }
}
