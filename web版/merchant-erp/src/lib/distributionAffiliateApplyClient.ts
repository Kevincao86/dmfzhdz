import { publicPortalApiFetchUrls } from './merchantErpApiBase.js'

export type AffiliateApplySource = 'cs' | 'dr' | 'mp'

export type PublicAffiliateSummary = {
  id: string
  refCode?: string
  realName: string
  phone: string
  status: 'pending' | 'active' | 'disabled' | 'rejected'
  appliedAt: string
  approvedAt?: string
  applySource?: AffiliateApplySource
}

function detectApplySource(): AffiliateApplySource {
  if (typeof window === 'undefined') return 'cs'
  const host = window.location.hostname.toLowerCase()
  if (host.includes('dr.')) return 'dr'
  return 'cs'
}

async function fetchAffiliateApi(
  init: RequestInit,
  pathWithQuery: string,
): Promise<{ res: Response; json: Record<string, unknown> }> {
  let lastRes: Response | null = null
  let lastJson: Record<string, unknown> = { ok: false, error: 'request_failed' }
  for (const url of publicPortalApiFetchUrls(pathWithQuery)) {
    const res = await fetch(url, init)
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.ok) return { res, json }
    lastRes = res
    lastJson = json
    if (res.status !== 404) break
  }
  return { res: lastRes ?? new Response(null, { status: 502 }), json: lastJson }
}

export async function applyAsAffiliate(body: {
  realName: string
  phone: string
  applySource?: AffiliateApplySource
  note?: string
}): Promise<{ ok: boolean; created?: boolean; affiliate?: PublicAffiliateSummary; error?: string }> {
  const { json } = await fetchAffiliateApi(
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        applySource: body.applySource ?? detectApplySource(),
      }),
    },
    '/api/meoo-distribution-affiliate-apply',
  )
  if (json.ok === false) {
    return { ok: false, error: String(json.error || 'request_failed'), affiliate: json.affiliate as PublicAffiliateSummary | undefined }
  }
  return {
    ok: true,
    created: json.created === true,
    affiliate: json.affiliate as PublicAffiliateSummary | undefined,
  }
}

export async function fetchAffiliateApplyStatus(
  phone: string,
): Promise<{ ok: boolean; affiliate: PublicAffiliateSummary | null; error?: string }> {
  const q = `/api/meoo-distribution-affiliate-apply?phone=${encodeURIComponent(phone)}`
  const { json } = await fetchAffiliateApi({ method: 'GET' }, q)
  if (json.ok === false) {
    return { ok: false, affiliate: null, error: String(json.error || 'request_failed') }
  }
  return {
    ok: true,
    affiliate: (json.affiliate as PublicAffiliateSummary | null) ?? null,
  }
}

export function affiliateStatusLabel(status: PublicAffiliateSummary['status']): string {
  switch (status) {
    case 'pending':
      return '待审核'
    case 'active':
      return '已通过'
    case 'rejected':
      return '未通过'
    case 'disabled':
      return '已停用'
    default:
      return status
  }
}
