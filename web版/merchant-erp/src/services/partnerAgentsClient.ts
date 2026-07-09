import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'
import { resolveMerchantApiBearer } from '../lib/merchantApiAuth'

export type PartnerAgentListItem = {
  tenantId: string
  name: string
  createdAt: string
  contactPhone: string | null
  loginName: string | null
  clientCount: number
}

export type PartnerAgentEntitlement = {
  id: string
  parentTenantId: string
  agentTenantId: string
  agentName: string
  seatLimit: number
  packagePointsQuota: number
  rechargePointsQuota: number
  packagePointsUsed: number
  rechargePointsUsed: number
  packagePointsRemain: number
  rechargePointsRemain: number
  totalRemain: number
  serviceExpireAt: string | null
  note: string | null
  updatedAt: string
}

export type PartnerAgentSettlementRow = {
  agentTenantId: string
  agentName: string
  contactPhone: string | null
  clientCount: number
  packagePointsQuota: number
  packagePointsUsed: number
  rechargePointsQuota: number
  rechargePointsUsed: number
  totalPointsUsed: number
  totalPointsRemain: number
}

async function partnerApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { token } = await resolveMerchantApiBearer()
  if (!token) throw new Error('请先登录')

  let lastErr = '请求失败'
  for (const url of merchantApiFetchUrls(path)) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init?.headers as Record<string, string> | undefined),
        },
      })
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok || json.ok === false) {
        lastErr = String(json.message || json.error || res.statusText || '请求失败')
        continue
      }
      return json as T
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}

export async function fetchPartnerAgents(): Promise<PartnerAgentListItem[]> {
  const data = await partnerApiFetch<{ agents: PartnerAgentListItem[] }>('/api/meoo-partner-agents')
  return data.agents ?? []
}

export async function createPartnerAgent(input: {
  companyName: string
  contactPhone: string
  password?: string
}): Promise<{
  tenantId: string
  loginName: string
  email: string
  tempPassword: string
  message: string
}> {
  const data = await partnerApiFetch<{
    tenantId: string
    loginName: string
    email: string
    tempPassword: string
    message: string
  }>('/api/meoo-partner-agents', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return data
}

export async function fetchPartnerAgentEntitlements(): Promise<PartnerAgentEntitlement[]> {
  const data = await partnerApiFetch<{ entitlements: PartnerAgentEntitlement[] }>(
    '/api/meoo-partner-agent-entitlements',
  )
  return data.entitlements ?? []
}

export async function savePartnerAgentEntitlement(input: {
  agentTenantId: string
  seatLimit?: number
  packagePointsQuota?: number
  rechargePointsQuota?: number
  serviceExpireAt?: string | null
  note?: string | null
}): Promise<PartnerAgentEntitlement> {
  const data = await partnerApiFetch<{ entitlement: PartnerAgentEntitlement }>(
    '/api/meoo-partner-agent-entitlements',
    { method: 'PUT', body: JSON.stringify(input) },
  )
  return data.entitlement
}

export async function fetchPartnerAgentSettlement(): Promise<PartnerAgentSettlementRow[]> {
  const data = await partnerApiFetch<{ rows: PartnerAgentSettlementRow[] }>(
    '/api/meoo-partner-agent-settlement',
  )
  return data.rows ?? []
}
