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

async function postMpAuthAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
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
          ...body,
          sessionToken: token,
          token,
        }),
      })
      const data = await parseJsonRes(res)
      if (!res.ok || data.ok === false) {
        throw new Error(String(data.error || data.message || `http_${res.status}`))
      }
      return data
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
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
  try {
    const data = await postMpAuthAction({
      action: 'membership_plan_checkout',
      ...body,
    })
    return {
      requestId: String(data.requestId || ''),
      message: String(
        data.message ||
          '支付申报已提交，请等待运营在管控台核对确认；确认后将自动开通对应会员版本。',
      ),
    }
  } catch (e) {
    throw new Error(formatMpApiErr(e, '提交支付申报失败'))
  }
}

export async function createMembershipWechatPrepay(body: {
  workRole: MpLibraryRole
  planId: string
  billing: 'monthly' | 'yearly'
}): Promise<{ requestId: string; outTradeNo: string; codeUrl: string }> {
  try {
    const data = await postMpAuthAction({
      action: 'membership_wechat_prepay',
      payMode: 'native',
      workRole: body.workRole,
      planId: body.planId,
      billing: body.billing,
    })
    const codeUrl = String(data.codeUrl || '').trim()
    const outTradeNo = String(data.outTradeNo || '').trim()
    if (!codeUrl || !outTradeNo) throw new Error('wechat_prepay_invalid_response')
    return {
      requestId: String(data.requestId || ''),
      outTradeNo,
      codeUrl,
    }
  } catch (e) {
    throw new Error(formatMpApiErr(e, '微信下单失败，请稍后重试'))
  }
}

export async function pollMembershipWechatPay(
  outTradeNo: string,
): Promise<{ status: 'pending' | 'paid'; message: string; requestId?: string }> {
  try {
    const data = await postMpAuthAction({
      action: 'membership_wechat_poll',
      outTradeNo,
    })
    const status = data.status === 'paid' ? 'paid' : 'pending'
    return {
      status,
      requestId: data.requestId ? String(data.requestId) : undefined,
      message: String(
        data.message ||
          (status === 'paid'
            ? '支付成功，会员档位已开通，约 20 秒内与电脑端同步。'
            : '等待支付完成…'),
      ),
    }
  } catch (e) {
    throw new Error(formatMpApiErr(e, '查询支付状态失败'))
  }
}
