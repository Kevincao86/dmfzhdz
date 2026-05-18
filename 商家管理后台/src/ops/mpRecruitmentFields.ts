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
> {
  const summary = String(order.infoSummary || '').trim()
  const region = pickField(summary, '城市') || order.storeName || order.storeAddress || '—'
  const category = pickField(summary, '行业') || order.category || '本地生活'
  const platform = order.accountType && order.accountType !== '—' ? order.accountType : '抖音'
  const budget = Math.max(0, order.serviceAmount || 0)
  const budgetText = budget > 0 ? `¥${budget.toLocaleString('zh-CN')}` : '面议'
  const recruitCount = parseRecruitCount(summary, order.fans) || (order.fans > 0 ? order.fans : 1)
  const fansRequirement = order.fans >= 5000 ? `≥${order.fans.toLocaleString('zh-CN')}` : '≥5000'

  const recruitmentLines: string[] = []
  const taskLines: string[] = []
  if (summary) {
    const parts = summary.split(/[；;]/).map((p) => p.trim()).filter(Boolean)
    for (const p of parts) {
      if (/套餐|探店|策略|档位|佣金|预算|招募[:：]|城市|行业/.test(p)) {
        recruitmentLines.push(p)
      } else if (/说明|交付|备注|要求|结算|出片|组/.test(p)) {
        taskLines.push(p)
      } else {
        recruitmentLines.push(p)
      }
    }
  }
  if (!recruitmentLines.length && summary) recruitmentLines.push(summary)
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

  return {
    title,
    recruitmentInfo: recruitmentLines.join('\n'),
    taskDetail: taskLines.length ? taskLines.join('\n') : merchantRequirements,
    merchantRequirements,
    platform,
    fansRequirement,
    budgetText,
    recruitCount,
    region,
    category,
    serviceAmount: budget,
  }
}
