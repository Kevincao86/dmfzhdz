import { fetchOpsErpApi } from '../lib/opsErpApiBase.js'
import { requireOpsModuleEdit } from './opsStaffAuth'

export type MarketingSurface = 'xingxuan' | 'merchant_erp'

export type MarketingCampaignForm = {
  title: string
  subtitle: string
  enabled: boolean
  amountYuan: string
  totalQuota: number
  grantedCount: number
  remaining: number
  posterUrl: string
  rulesText: string
  withdrawAfterOrders: number
  updatedAt: string
}

export type MarketingGrantRow = {
  id: string
  prKey: string
  orderId: string
  displayName: string
  amountYuan: string
  createdAt: string
}

export type MarketingWithdrawRow = {
  id: string
  prKey: string
  displayName: string
  amountYuan: string
  qualifyingOrders: number
  status: 'pending' | 'paid'
  createdAt: string
  paidAt?: string
}

export type MarketingCenterPayload = {
  campaign: MarketingCampaignForm
  grants: MarketingGrantRow[]
  withdraws: MarketingWithdrawRow[]
}

function surfaceBody(surface: MarketingSurface) {
  return surface
}

async function postCampaign(body: Record<string, unknown>): Promise<
  { ok: true; data: MarketingCenterPayload } | { ok: false; error: string }
> {
  const res = await fetchOpsErpApi('/api/meoo-ops-marketing-campaign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(text || '{}') as Record<string, unknown>
  } catch {
    /* ignore */
  }
  if (!res.ok || data.ok === false) {
    return { ok: false, error: String(data.detail || data.error || '加载失败') }
  }
  const campaign = data.campaign && typeof data.campaign === 'object' ? (data.campaign as MarketingCampaignForm) : null
  if (!campaign) return { ok: false, error: '活动数据为空' }
  return {
    ok: true,
    data: {
      campaign,
      grants: Array.isArray(data.grants) ? (data.grants as MarketingGrantRow[]) : [],
      withdraws: Array.isArray(data.withdraws) ? (data.withdraws as MarketingWithdrawRow[]) : [],
    },
  }
}

export async function loadMarketingCampaign(surface: MarketingSurface) {
  return postCampaign({ action: 'get', surface: surfaceBody(surface) })
}

export async function saveMarketingCampaign(surface: MarketingSurface, campaign: MarketingCampaignForm) {
  const denied = requireOpsModuleEdit('marketing')
  if (denied) return { ok: false as const, error: denied }
  return postCampaign({
    action: 'save',
    surface: surfaceBody(surface),
    campaign: {
      title: campaign.title,
      subtitle: campaign.subtitle,
      enabled: campaign.enabled,
      amountYuan: Number(campaign.amountYuan),
      totalQuota: campaign.totalQuota,
      posterUrl: campaign.posterUrl,
      rulesText: campaign.rulesText,
      withdrawAfterOrders: campaign.withdrawAfterOrders,
    },
  })
}

export async function markMarketingWithdrawPaid(surface: MarketingSurface, withdrawId: string) {
  const denied = requireOpsModuleEdit('marketing')
  if (denied) return { ok: false as const, error: denied }
  return postCampaign({ action: 'markPaid', surface: surfaceBody(surface), withdrawId })
}
