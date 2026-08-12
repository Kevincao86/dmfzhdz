import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'
import { resolveMerchantApiBearer } from '../lib/merchantApiAuth'

export type PartnerLinkeOnboardItem = {
  id: string
  tenantId: string
  clientLabel: string | null
  outShopId: string
  merchantAccountId: string | null
  poiId: string | null
  authStatus: 'pending' | 'authorized' | 'failed'
  cooperationStatus: 'pending' | 'created' | 'confirmed' | 'failed' | 'skipped'
  cooperationOrderId: string | null
  cooperationError: string | null
  authUrl: string | null
  partnerClientId: string | null
  ownerAgentTenantId: string | null
  solutionKey: string
  createdAt: string
  updatedAt: string
}

async function partnerLinkeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { token } = await resolveMerchantApiBearer()
  if (!token) throw new Error('请先登录')

  let lastErr = '请求失败'
  for (const url of merchantApiFetchUrls(path)) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init?.headers as Record<string, string> | undefined),
        },
      })
      const text = await res.text()
      if (text.trimStart().startsWith('<')) {
        lastErr = '接口返回 HTML，请检查部署'
        continue
      }
      const j = JSON.parse(text || '{}') as Record<string, unknown>
      if (!res.ok || j.ok === false) {
        lastErr = String(j.message || j.error || `HTTP ${res.status}`)
        if (res.status === 404) continue
        throw new Error(lastErr)
      }
      return j as T
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}

export async function listPartnerLinkeOnboarding(): Promise<PartnerLinkeOnboardItem[]> {
  const j = await partnerLinkeFetch<{ items?: PartnerLinkeOnboardItem[] }>(
    '/api/meoo-partner-linke-onboard',
    { method: 'GET' },
  )
  return Array.isArray(j.items) ? j.items : []
}

export async function startPartnerLinkeInvite(input: {
  clientLabel?: string
  solutionKey?: string
}): Promise<{ item: PartnerLinkeOnboardItem; authUrl: string; message?: string }> {
  const j = await partnerLinkeFetch<{
    item: PartnerLinkeOnboardItem
    authUrl: string
    message?: string
  }>('/api/meoo-partner-linke-onboard', {
    method: 'POST',
    body: JSON.stringify({
      action: 'invite',
      clientLabel: input.clientLabel,
      solutionKey: input.solutionKey,
    }),
  })
  if (!j.item || !j.authUrl) throw new Error('未返回授权链接')
  return j
}

export async function retryPartnerLinkeCooperation(onboardingId: string): Promise<string> {
  const j = await partnerLinkeFetch<{ orderId?: string; message?: string }>(
    '/api/meoo-partner-linke-onboard',
    {
      method: 'POST',
      body: JSON.stringify({ action: 'retry_cooperation', onboardingId }),
    },
  )
  return String(j.message || `合作单 ${j.orderId ?? ''} 已提交`)
}

export async function deletePartnerLinkeOnboarding(onboardingId: string): Promise<void> {
  await partnerLinkeFetch('/api/meoo-partner-linke-onboard', {
    method: 'POST',
    body: JSON.stringify({ action: 'delete', onboardingId }),
  })
}

export type PartnerLinkeCapabilityProbe = {
  clientKey: string
  spAccountId: string
  clientTokenOk: boolean
  partnerOrderQuery: { ok: boolean; errorCode: number | null; description: string }
  shopPoiQuery: { ok: boolean; errorCode: number | null; description: string }
  hint: string
}

export async function diagnosePartnerLinkeCapabilities(): Promise<{
  probe: PartnerLinkeCapabilityProbe
  message?: string
}> {
  const j = await partnerLinkeFetch<{
    probe: PartnerLinkeCapabilityProbe
    message?: string
  }>('/api/meoo-partner-linke-onboard', {
    method: 'POST',
    body: JSON.stringify({ action: 'diagnose' }),
  })
  if (!j.probe) throw new Error('未返回能力探测结果')
  return j
}

export async function syncPartnerBoundClientsFromDouyin(): Promise<{
  upserted: number
  scanned: number
  message: string
}> {
  const j = await partnerLinkeFetch<{
    upserted?: number
    scanned?: number
    message?: string
  }>('/api/meoo-partner-linke-onboard', {
    method: 'POST',
    body: JSON.stringify({ action: 'sync_bound_clients' }),
  })
  return {
    upserted: Number(j.upserted || 0),
    scanned: Number(j.scanned || 0),
    message: String(j.message || '同步完成'),
  }
}

export function linkeOnboardStatusLabel(item: PartnerLinkeOnboardItem): string {
  if (item.authStatus === 'pending') return '待商家授权'
  if (item.authStatus === 'failed') return '授权失败'
  if (item.cooperationStatus === 'created') return '待商家 App 确认代运营'
  if (item.cooperationStatus === 'confirmed') return '已开通'
  if (item.cooperationStatus === 'failed') return `代运营发起失败：${item.cooperationError || '—'}`
  if (item.authStatus === 'authorized' && item.partnerClientId) return '已授权（客户已入库）'
  return '处理中'
}
