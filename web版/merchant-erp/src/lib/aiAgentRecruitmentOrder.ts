import type { AiRecruitmentBriefPreview, AiRecruitmentOrderDetail } from './aiAgentTypes'
import type { RegistryRecruitmentOrder } from './opsRegistryTypes'
import { buildErpRegistryTenant } from './buildErpRegistryTenant'
import type { AiRecruitmentIntent } from './aiAgentRecruitmentParse'
import type { NoviceAllocation } from '../services/recruitmentNoviceAllocationAi'
import { kolTierStrategyLabel } from '../services/recruitmentNoviceAllocationAi'

export function recruitmentOrderDetailFromRegistry(
  order: RegistryRecruitmentOrder,
  brief: AiRecruitmentBriefPreview,
  intent: AiRecruitmentIntent,
  allocation: NoviceAllocation,
): AiRecruitmentOrderDetail {
  const total = allocation.v3 + allocation.v4 + allocation.v5 + allocation.v5plus
  return {
    orderId: order.id,
    opsStatusLabel: '待运营接单',
    platform: order.recruitmentPlatform ?? intent.platform,
    storeName: order.storeName,
    mainProductName: brief.mainProductName,
    budgetYuan: intent.budgetYuan,
    totalHeadcount: total,
    tags: brief.tags ?? [],
    briefExcerpt: (brief.briefText || '').slice(0, 160),
    briefText: brief.briefText || '',
    createdAt: order.createdAt,
    allocation: {
      v3: allocation.v3,
      v4: allocation.v4,
      v5: allocation.v5,
      v5plus: allocation.v5plus,
      source: allocation.source,
      ...(allocation.notes ? { notes: allocation.notes } : {}),
      ...(allocation.costHint ? { costHint: allocation.costHint } : {}),
    },
  }
}

/** 智能体确认后：生成待运营接单的商家达人招募订单（含 AI 分配摘要） */
export function buildRecruitmentOrderFromAgentBrief(
  brief: AiRecruitmentBriefPreview,
  tenantMeta: { tenantId?: string; ownerUserId?: string },
  params: {
    intent: AiRecruitmentIntent
    allocation: NoviceAllocation
    userBrief: string
  },
): RegistryRecruitmentOrder {
  const tenant = buildErpRegistryTenant()
  const customerName = tenant?.merchantName ?? '墨典 ERP 商户'
  const id = `RO-AI${Date.now()}`
  const platform = params.intent.platform
  const isXhs = platform === '小红书'
  const tags = brief.tags?.length ? brief.tags.join('、') : '—'
  const { allocation, intent } = params
  const total = allocation.v3 + allocation.v4 + allocation.v5 + allocation.v5plus
  const tierLine = isXhs
    ? `小红书达人约 ${total} 人`
    : `V3:${allocation.v3} V4:${allocation.v4} V5:${allocation.v5} V5+:${allocation.v5plus}`

  return {
    id,
    ...tenantMeta,
    customerName,
    storeName: brief.mainProductName || '智能体招募',
    talentId: '—',
    talentName: '智能体·AI 分配待接单',
    fans: total,
    accountType: brief.platform || platform,
    recruitmentPlatform: platform,
    coopTimes: 0,
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    status: 'pending',
    serviceAmount: intent.budgetYuan,
    commissionPct: intent.kolCommissionPct,
    netAmount: 0,
    storeAddress: customerName,
    category: '智能体招募',
    fulfillmentLoop: 'open',
    orderKind: 'recruitment',
    infoSummary: [
      `【智能体·开环招募】平台:${platform}；城市:${intent.city || '—'}；预算¥${intent.budgetYuan}；`,
      isXhs ? '' : `达人佣金:${intent.kolCommissionPct}%；`,
      isXhs ? '' : `策略:${kolTierStrategyLabel(intent.strategy)}；`,
      `档位:${tierLine}；分配:${allocation.source === 'ai' ? 'AI模型' : '规则估算'}；`,
      `主推:${brief.mainProductName}；标签:${tags}；`,
      `Brief:${(brief.briefText || '').slice(0, 500)}`,
      allocation.costHint ? `；${allocation.costHint}` : '',
    ].join(''),
  }
}
