import type { MpLibraryRole } from '@merchant/lib/mpMembershipCatalog'
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

export type MpPointsPayChannel = 'wechat' | 'alipay' | 'douyin'

export async function createPointsWechatPrepay(body: {
  workRole: MpLibraryRole
  points?: number
  yuan?: number
}): Promise<{ requestId: string; outTradeNo: string; codeUrl: string; points: number; amountCents: number }> {
  try {
    const data = await postMpAuthAction({
      action: 'points_wechat_prepay',
      payMode: 'native',
      workRole: body.workRole,
      ...(body.points != null ? { points: body.points } : {}),
      ...(body.yuan != null ? { yuan: body.yuan } : {}),
    })
    const codeUrl = String(data.codeUrl || '').trim()
    const outTradeNo = String(data.outTradeNo || '').trim()
    if (!codeUrl || !outTradeNo) throw new Error('wechat_prepay_invalid_response')
    return {
      requestId: String(data.requestId || ''),
      outTradeNo,
      codeUrl,
      points: Math.floor(Number(data.points) || 0),
      amountCents: Math.floor(Number(data.amountCents) || 0),
    }
  } catch (e) {
    throw new Error(formatMpApiErr(e, '微信下单失败，请稍后重试'))
  }
}

export async function pollPointsWechatPay(
  outTradeNo: string,
): Promise<{ status: 'pending' | 'paid'; message: string; requestId?: string; newBalance?: number }> {
  try {
    const data = await postMpAuthAction({
      action: 'points_wechat_poll',
      outTradeNo,
    })
    const status = data.status === 'paid' ? 'paid' : 'pending'
    return {
      status,
      requestId: data.requestId ? String(data.requestId) : undefined,
      newBalance:
        data.newBalance != null && Number.isFinite(Number(data.newBalance))
          ? Math.floor(Number(data.newBalance))
          : undefined,
      message: String(
        data.message ||
          (status === 'paid'
            ? '支付成功，积分已到账，约 20 秒内与电脑端同步。'
            : '等待支付完成…'),
      ),
    }
  } catch (e) {
    throw new Error(formatMpApiErr(e, '查询支付状态失败'))
  }
}

export async function createPointsAlipayPrepay(body: {
  workRole: MpLibraryRole
  points?: number
  yuan?: number
}): Promise<{
  requestId: string
  outTradeNo: string
  qrCode?: string
  payPageUrl?: string
  payMode?: string
  points: number
  amountCents: number
}> {
  try {
    const data = await postMpAuthAction({
      action: 'points_alipay_prepay',
      workRole: body.workRole,
      ...(body.points != null ? { points: body.points } : {}),
      ...(body.yuan != null ? { yuan: body.yuan } : {}),
    })
    const qrCode = String(data.qrCode || '').trim()
    const payPageUrl = String(data.payPageUrl || '').trim()
    const outTradeNo = String(data.outTradeNo || '').trim()
    if ((!qrCode && !payPageUrl) || !outTradeNo) throw new Error('alipay_prepay_invalid_response')
    return {
      requestId: String(data.requestId || ''),
      outTradeNo,
      qrCode: qrCode || undefined,
      payPageUrl: payPageUrl || undefined,
      payMode: String(data.payMode || ''),
      points: Math.floor(Number(data.points) || 0),
      amountCents: Math.floor(Number(data.amountCents) || 0),
    }
  } catch (e) {
    throw new Error(formatMpApiErr(e, '支付宝下单失败，请稍后重试'))
  }
}

export async function createPointsDouyinPrepay(body: {
  workRole: MpLibraryRole
  points?: number
  yuan?: number
}): Promise<{ requestId: string; outTradeNo: string; qrCode: string; points: number; amountCents: number }> {
  try {
    const data = await postMpAuthAction({
      action: 'points_douyin_prepay',
      payMode: 'native',
      workRole: body.workRole,
      ...(body.points != null ? { points: body.points } : {}),
      ...(body.yuan != null ? { yuan: body.yuan } : {}),
    })
    const qrCode = String(data.qrCode || data.codeUrl || '').trim()
    const outTradeNo = String(data.outTradeNo || '').trim()
    if (!qrCode || !outTradeNo) throw new Error('douyin_prepay_invalid_response')
    return {
      requestId: String(data.requestId || ''),
      outTradeNo,
      qrCode,
      points: Math.floor(Number(data.points) || 0),
      amountCents: Math.floor(Number(data.amountCents) || 0),
    }
  } catch (e) {
    throw new Error(formatMpApiErr(e, '抖音下单失败，请稍后重试'))
  }
}

export async function pollPointsAlipayPay(
  outTradeNo: string,
): Promise<{ status: 'pending' | 'paid'; message: string; requestId?: string; newBalance?: number }> {
  try {
    const data = await postMpAuthAction({
      action: 'points_alipay_poll',
      outTradeNo,
    })
    const status = data.status === 'paid' ? 'paid' : 'pending'
    return {
      status,
      requestId: data.requestId ? String(data.requestId) : undefined,
      newBalance:
        data.newBalance != null && Number.isFinite(Number(data.newBalance))
          ? Math.floor(Number(data.newBalance))
          : undefined,
      message: String(
        data.message ||
          (status === 'paid'
            ? '支付成功，积分已到账，约 20 秒内与电脑端同步。'
            : '等待支付完成…'),
      ),
    }
  } catch (e) {
    throw new Error(formatMpApiErr(e, '查询支付状态失败'))
  }
}

export async function pollPointsDouyinPay(
  outTradeNo: string,
): Promise<{ status: 'pending' | 'paid'; message: string; requestId?: string; newBalance?: number }> {
  try {
    const data = await postMpAuthAction({
      action: 'points_douyin_poll',
      outTradeNo,
    })
    const status = data.status === 'paid' ? 'paid' : 'pending'
    return {
      status,
      requestId: data.requestId ? String(data.requestId) : undefined,
      newBalance:
        data.newBalance != null && Number.isFinite(Number(data.newBalance))
          ? Math.floor(Number(data.newBalance))
          : undefined,
      message: String(
        data.message ||
          (status === 'paid'
            ? '支付成功，积分已到账，约 20 秒内与电脑端同步。'
            : '等待支付完成…'),
      ),
    }
  } catch (e) {
    throw new Error(formatMpApiErr(e, '查询支付状态失败'))
  }
}

export async function pollPointsPay(
  channel: MpPointsPayChannel,
  outTradeNo: string,
): Promise<{ status: 'pending' | 'paid'; message: string; requestId?: string; newBalance?: number }> {
  if (channel === 'alipay') return pollPointsAlipayPay(outTradeNo)
  if (channel === 'douyin') return pollPointsDouyinPay(outTradeNo)
  return pollPointsWechatPay(outTradeNo)
}
