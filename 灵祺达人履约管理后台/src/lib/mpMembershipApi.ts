import type { MpLibraryRole, MpMembershipPlanVersion } from '@merchant/lib/mpMembershipCatalog'
import { mpApiFetchCandidates } from './mpApiBase'
import { formatMpApiErr } from './mpApiErrors'
import { getToken } from './mpSession'

async function parseJsonRes(res: Response) {
  const text = await res.text()
  if (!text.trim()) throw new Error(`接口返回为空（HTTP ${res.status}）`)
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`接口返回非 JSON（HTTP ${res.status}）`)
  }
}

export async function fetchMembershipPlanVersions(
  role: MpLibraryRole,
): Promise<MpMembershipPlanVersion[]> {
  const apiPath = `/api/meoo-ops-mp-membership-plan-versions?role=${encodeURIComponent(role)}`
  const urls = mpApiFetchCandidates(apiPath)
  let lastErr: unknown
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'GET' })
      const data = await parseJsonRes(res)
      if (!res.ok || data.ok === false) {
        throw new Error(String(data.error || `http_${res.status}`))
      }
      const versions = data.versions
      return Array.isArray(versions) ? (versions as MpMembershipPlanVersion[]) : []
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(formatMpApiErr(lastErr, '加载会员方案失败'))
}

export async function submitMembershipPlanCheckout(body: {
  workRole: MpLibraryRole
  planId: string
  billing: 'monthly' | 'yearly'
  channel: 'wechat' | 'alipay'
  displayName?: string
}): Promise<{ requestId: string; message: string }> {
  const token = getToken()
  const apiPath = '/api/meoo-ops-mp-auth'
  const urls = mpApiFetchCandidates(apiPath)
  let lastErr: unknown
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'membership_plan_checkout',
          token,
          ...body,
        }),
      })
      const data = await parseJsonRes(res)
      if (!res.ok || data.ok === false) {
        throw new Error(String(data.error || data.message || `http_${res.status}`))
      }
      return {
        requestId: String(data.requestId || ''),
        message: String(
          data.message ||
            '支付申报已提交，请等待运营在管控台核对确认；确认后将自动开通对应会员版本。',
        ),
      }
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(formatMpApiErr(lastErr, '提交支付申报失败'))
}
