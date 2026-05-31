import { fetchOpsErpApi } from '../lib/opsErpApiBase.js'

export type TokenmixUsageResponse = {
  ok: boolean
  membershipPlan?: string
  tokenmixBound?: boolean
  directAiCallsUsed?: number
  directAiUsageMonth?: string | null
  tokenmixUsage?: Record<string, unknown>
  error?: string
  detail?: string
}

export async function bindTenantTokenmixKey(
  tenantId: string,
  apiKey: string,
): Promise<{ ok: boolean; error?: string; detail?: string }> {
  const res = await fetchOpsErpApi('/api/meoo-supabase-tenants-tokenmix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: tenantId, action: 'bind', apiKey }),
  })
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; detail?: string }
  if (!res.ok || !j.ok) {
    return {
      ok: false,
      error: j.error ?? `http_${res.status}`,
      detail: j.detail,
    }
  }
  return { ok: true }
}

export async function fetchTenantTokenmixUsage(
  tenantId: string,
): Promise<TokenmixUsageResponse> {
  const res = await fetchOpsErpApi('/api/meoo-supabase-tenants-tokenmix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: tenantId, action: 'usage' }),
  })
  const j = (await res.json().catch(() => ({}))) as TokenmixUsageResponse
  if (!res.ok || !j.ok) {
    return {
      ok: false,
      error: j.error ?? `http_${res.status}`,
      detail: j.detail,
    }
  }
  return j
}
