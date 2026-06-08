import type {
  RegistryMpRecruitmentOrder,
  RegistryRecruitmentOrder,
} from './opsRegistryTypes'
import type { RecruitmentTierPlan } from './merchantRecruitmentTierPlan'
import { tierPlanSummaryLines } from './merchantRecruitmentTierPlan'

function pickPlatform(order: RegistryRecruitmentOrder): '抖音' | '小红书' {
  const p = order.recruitmentPlatform || order.accountType || ''
  return p.includes('小红书') ? '小红书' : '抖音'
}

function buildDeadline(days = 7): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleString('zh-CN', { hour12: false }).slice(0, 16)
}

/** 商家招募单 → 星选小程序招募单（AI 已填阶梯/一口价方案） */
export function buildMpOrderFromMerchantRecruitment(
  order: RegistryRecruitmentOrder,
  tierPlan?: RecruitmentTierPlan,
): RegistryMpRecruitmentOrder {
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const mpId = `MP-RO-${Date.now()}`
  const platform = pickPlatform(order)
  const budget = Math.max(0, order.serviceAmount || 0)
  const recruitCount = tierPlan?.totalHeadcount ?? (order.fans > 0 ? order.fans : 1)
  const planLines = tierPlan ? tierPlanSummaryLines(tierPlan) : []
  const recruitmentInfo = [
    order.infoSummary?.trim() || '',
    planLines.length ? `\n【AI招募方案】\n${planLines.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 4000)

  const region = tierPlan?.city || order.storeName || order.storeAddress || '—'
  const title = `${order.customerName}·${order.storeName}${order.category || '达人'}招募`

  return {
    id: mpId,
    sourceMerchantOrderId: order.id,
    customerName: order.customerName,
    storeName: order.storeName,
    merchantRequirements: recruitmentInfo,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    applicants: [],
    orderKind: order.orderKind === 'recruitment_ice' ? 'recruitment_ice' : 'recruitment',
    hall: order.orderKind === 'recruitment_ice' ? 'ice' : 'normal',
    fulfillmentLoop: order.fulfillmentLoop ?? 'open',
    title,
    recruitmentInfo,
    taskDetail:
      '商家通过 ERP 发起招募；达人报名后由商家在 ERP 反选，确认后推送群码与探店排期。',
    platform,
    fansRequirement: '按招募方案档位',
    budgetText: budget > 0 ? `¥${budget.toLocaleString('zh-CN')}` : '面议',
    recruitCount,
    region,
    category: order.category || '本地生活',
    serviceAmount: budget,
    urgent: false,
    deadline: buildDeadline(),
    publisherIdentity: 'merchant',
    mpPublishMeta: {
      recruitTarget: 'talent',
      deliveryWindow: 'normal',
      feeTypeId: tierPlan?.feeType === 'fixed' ? 'fixed' : 'level_tier',
      fixedPrice: tierPlan?.feeType === 'fixed' ? String(tierPlan.fixedPriceYuan ?? '') : '',
      tierPlan: tierPlan ?? null,
      merchantWorkflow: true,
      signupDeadline: buildDeadline(),
    },
  }
}
