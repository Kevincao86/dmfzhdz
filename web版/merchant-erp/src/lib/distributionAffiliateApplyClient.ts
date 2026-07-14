import { merchantApiAuthHeaders, resolveMerchantApiBearer } from './merchantApiAuth'
import { merchantApiFetchUrls, publicPortalApiFetchUrls } from './merchantErpApiBase.js'

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

async function authHeaders(): Promise<Record<string, string>> {
  const { token, source } = await resolveMerchantApiBearer()
  return {
    'Content-Type': 'application/json',
    ...merchantApiAuthHeaders(token, source),
  }
}

async function fetchAffiliateApiPublic(
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

async function fetchAffiliateApiAuthed(
  init: RequestInit,
  pathWithQuery: string,
): Promise<{ res: Response; json: Record<string, unknown> }> {
  const headers = await authHeaders()
  let lastJson: Record<string, unknown> = { ok: false, error: 'request_failed' }
  for (const url of merchantApiFetchUrls(pathWithQuery)) {
    const res = await fetch(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.ok) return { res, json }
    lastJson = json
    if (res.status !== 404) break
  }
  return { res: new Response(null, { status: 502 }), json: lastJson }
}

export function affiliateApplyErrorLabel(error: string | undefined): string {
  switch (error) {
    case 'already_active':
      return '您已是推广员，请前往「我的推广」查看推广码与数据'
    case 'phone_taken':
      return '该手机号已被其他账号用于推广员申请，请使用注册手机号或联系运营'
    case 'distribution_disabled':
      return '推广员申请暂未开放，请稍后再试'
    case 'invalid_fields':
      return '请填写真实姓名与有效大陆手机号'
    case 'invalid_phone':
      return '请输入有效大陆手机号'
    default:
      return error || '操作失败，请稍后重试'
  }
}

export async function applyAsAffiliate(body: {
  realName: string
  phone: string
  applySource?: AffiliateApplySource
  note?: string
}): Promise<{ ok: boolean; created?: boolean; affiliate?: PublicAffiliateSummary; error?: string }> {
  const { token } = await resolveMerchantApiBearer()
  const { json } = token
    ? await fetchAffiliateApiAuthed(
        {
          method: 'POST',
          body: JSON.stringify({
            ...body,
            applySource: body.applySource ?? detectApplySource(),
          }),
        },
        '/api/meoo-distribution-affiliate-apply',
      )
    : await fetchAffiliateApiPublic(
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
    return {
      ok: false,
      error: String(json.error || 'request_failed'),
      affiliate: json.affiliate as PublicAffiliateSummary | undefined,
    }
  }
  return {
    ok: true,
    created: json.created === true,
    affiliate: json.affiliate as PublicAffiliateSummary | undefined,
  }
}

/** 登录态：按当前 cs/dr 账号查询申请记录 */
export async function fetchMyAffiliateApplyStatus(): Promise<{
  ok: boolean
  affiliate: PublicAffiliateSummary | null
  error?: string
}> {
  const { token } = await resolveMerchantApiBearer()
  if (!token) return { ok: true, affiliate: null }
  const { json } = await fetchAffiliateApiAuthed({ method: 'GET' }, '/api/meoo-distribution-affiliate-apply')
  if (json.ok === false) {
    return { ok: false, affiliate: null, error: String(json.error || 'request_failed') }
  }
  return {
    ok: true,
    affiliate: (json.affiliate as PublicAffiliateSummary | null) ?? null,
  }
}

export async function fetchAffiliateApplyStatus(
  phone: string,
): Promise<{ ok: boolean; affiliate: PublicAffiliateSummary | null; error?: string }> {
  const q = `/api/meoo-distribution-affiliate-apply?phone=${encodeURIComponent(phone)}`
  const { json } = await fetchAffiliateApiPublic({ method: 'GET' }, q)
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
