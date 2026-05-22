import type { AiRecruitmentBriefPreview } from './aiAgentTypes'
import type { RegistryRecruitmentOrder } from './opsRegistryTypes'
import { buildErpRegistryTenant } from './buildErpRegistryTenant'

/** 智能体确认后：生成待运营接单的商家达人招募订单 */
export function buildRecruitmentOrderFromAgentBrief(
  brief: AiRecruitmentBriefPreview,
  tenantMeta: { tenantId?: string; ownerUserId?: string },
): RegistryRecruitmentOrder {
  const tenant = buildErpRegistryTenant()
  const customerName = tenant?.merchantName ?? '墨典 ERP 商户'
  const id = `RO-AI${Date.now()}`
  const platform = brief.platform || '抖音'
  const tags = brief.tags?.length ? brief.tags.join('、') : '—'
  return {
    id,
    ...tenantMeta,
    customerName,
    storeName: brief.mainProductName || '智能体招募',
    talentId: '—',
    talentName: '智能体·待运营接单',
    fans: 1,
    accountType: platform,
    recruitmentPlatform: platform.includes('红') ? '小红书' : '抖音',
    coopTimes: 0,
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    status: 'pending',
    serviceAmount: 0,
    commissionPct: 0,
    netAmount: 0,
    storeAddress: customerName,
    category: '智能体招募',
    fulfillmentLoop: 'open',
    infoSummary: `【智能体·开环招募】平台:${platform}；主推:${brief.mainProductName}；标签:${tags}；Brief:${(brief.briefText || '').slice(0, 800)}`,
  }
}
