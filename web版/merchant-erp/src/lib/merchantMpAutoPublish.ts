import type {
  RegistryMpRecruitmentOrder,
  RegistryRecruitmentOrder,
} from './opsRegistryTypes'
import type { RecruitmentTierPlan } from './merchantRecruitmentTierPlan'
import { tierPlanSummaryLines } from './merchantRecruitmentTierPlan'
import { buildMpRecruitmentOrderId } from './mpRecruitmentOrderId'
import { normalizeRecruitmentPlatform } from './recruitmentPlatformOptions'

function pickPlatform(order: RegistryRecruitmentOrder): string {
  const raw = String(order.recruitmentPlatform || order.accountType || '').trim()
  const first = raw.split(/[/、,，]/)[0]?.trim() || raw
  return normalizeRecruitmentPlatform(first)
}

function buildDeadline(days = 7): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleString('zh-CN', { hour12: false }).slice(0, 16)
}

export type ProMpPublishExtras = {
  primaryPlatform: string
  contentTypes: string[]
  recruitMode: 'ai' | 'designated'
  recruitStart?: string
  recruitEnd?: string
  visitStart?: string
  visitEnd?: string
  visitSlots?: string[]
  talentTags?: string[]
  followerTiers?: string[]
  commerceLevels?: string[]
  industry?: string
  merchantCommissionPct?: number
  designatedTalent?: string
  note?: string
}

/** 商家招募单 → 星选小程序招募单（AI 已填阶梯/一口价方案） */
export function buildMpOrderFromMerchantRecruitment(
  order: RegistryRecruitmentOrder,
  tierPlan?: RecruitmentTierPlan,
): RegistryMpRecruitmentOrder {
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const mpId = buildMpRecruitmentOrderId('RO')
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
      recruitScope: 'open',
      deliveryWindow: 'normal',
      feeTypeId: tierPlan?.feeType === 'fixed' ? 'fixed' : 'level_tier',
      fixedPrice: tierPlan?.feeType === 'fixed' ? String(tierPlan.fixedPriceYuan ?? '') : '',
      tierPlan: tierPlan ?? null,
      merchantWorkflow: true,
      signupDeadline: buildDeadline(),
    },
  }
}

/** 专业版普通招募 → 星选大厅（与星选 PublishWizard 普通招募字段对齐） */
export function buildMpOrderFromProRecruitment(
  order: RegistryRecruitmentOrder,
  extras: ProMpPublishExtras,
): RegistryMpRecruitmentOrder {
  const base = buildMpOrderFromMerchantRecruitment(order)
  const platform = normalizeRecruitmentPlatform(extras.primaryPlatform || pickPlatform(order))
  const budget = Math.max(0, order.serviceAmount || 0)
  const recruitCount = Math.max(1, order.fans || 1)
  const modeLabel = extras.recruitMode === 'designated' ? '指定达人' : 'AI智能匹配'
  const recruitmentInfo = [
    order.infoSummary?.trim() || '',
    extras.note?.trim() ? `补充：${extras.note.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 4000)

  return {
    ...base,
    platform,
    recruitCount,
    recruitmentInfo,
    merchantRequirements: recruitmentInfo,
    taskDetail:
      extras.recruitMode === 'ai'
        ? '商家 ERP 普通招募 · AI 根据提需条件从星选达人库匹配；报名达人进入「达人反选」池。'
        : '商家 ERP 普通招募 · 指定达人模式；报名池与星选商单报名数据同步。',
    fansRequirement:
      extras.followerTiers?.length || extras.commerceLevels?.length
        ? [
            extras.followerTiers?.length ? `粉丝：${extras.followerTiers.join('、')}` : '',
            extras.commerceLevels?.length ? `带货：${extras.commerceLevels.join('、')}` : '',
          ]
            .filter(Boolean)
            .join('；')
        : '按提需条件筛选',
    mpPublishMeta: {
      ...(base.mpPublishMeta || {}),
      recruitScope: 'open',
      recruitTarget: 'talent',
      recruitMode: 'normal',
      merchantWorkflow: true,
      erpRecruitMode: extras.recruitMode,
      erpRecruitModeLabel: modeLabel,
      contentTypes: extras.contentTypes,
      industry: extras.industry,
      merchantCommissionPct: extras.merchantCommissionPct,
      recruitStart: extras.recruitStart,
      recruitEnd: extras.recruitEnd,
      visitStart: extras.visitStart,
      visitEnd: extras.visitEnd,
      visitSlots: extras.visitSlots,
      talentTags: extras.talentTags,
      followerTiers: extras.followerTiers,
      commerceLevels: extras.commerceLevels,
      designatedTalent: extras.designatedTalent,
      aiMatchFromLibrary: extras.recruitMode === 'ai',
      signupDeadline: buildDeadline(),
      budgetYuan: budget,
    },
  }
}
