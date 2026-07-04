import type { MpAccountRow } from './mpAccountAuth.js'
import type { RegistrySnapshot } from './opsRegistryTypes.js'
import {
  createAlipayMembershipPayOrder,
  loadAlipayPayConfig,
  queryAlipayOrderByOutTradeNo,
  type AlipayPayConfig,
} from './alipayPay.js'
import { buildPointsCheckoutBase, confirmPointsPayFromSnapshot, rejectPointsCheckoutIfExpired } from './mpPointsPayShared.js'
import type { RegistryMpPointsCheckoutRequest } from './opsRegistryTypes.js'

export async function createPointsAlipayPrepayFromSnapshot(
  data: RegistrySnapshot,
  account: MpAccountRow,
  body: Record<string, unknown>,
): Promise<
  | {
      ok: true
      requestId: string
      outTradeNo: string
      payMode: 'alipay_page' | 'alipay_precreate'
      points: number
      amountCents: number
      qrCode?: string
      payPageUrl?: string
    }
  | { ok: false; error: string; status: number }
> {
  const cfgResult = loadAlipayPayConfig()
  if (!cfgResult.ok) {
    return { ok: false, error: cfgResult.error, status: 503 }
  }
  const cfg = cfgResult.config

  const base = buildPointsCheckoutBase(data, account, body, {
    channel: 'alipay',
    payMode: cfg.payProduct === 'precreate' ? 'alipay_precreate' : 'alipay_page',
  })
  if (!base.ok) return base

  const { checkout, description } = base
  const attach = JSON.stringify({ rid: checkout.id, role: checkout.role, kind: 'points' })

  try {
    const order = await createAlipayMembershipPayOrder({
      cfg,
      outTradeNo: checkout.outTradeNo!,
      description,
      amountCents: checkout.amountCents,
      attach,
    })
    checkout.payMode = order.payMode
    return {
      ok: true,
      requestId: checkout.id,
      outTradeNo: checkout.outTradeNo!,
      payMode: order.payMode,
      points: checkout.points,
      amountCents: checkout.amountCents,
      qrCode: order.qrCode,
      payPageUrl: order.payPageUrl,
    }
  } catch (e) {
    checkout.status = 'rejected'
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      status: 502,
    }
  }
}

export async function resumePointsAlipayPayFromSnapshot(
  data: RegistrySnapshot,
  checkout: RegistryMpPointsCheckoutRequest,
): Promise<
  | {
      ok: true
      requestId: string
      outTradeNo: string
      channel: 'alipay'
      payMode: 'alipay_page' | 'alipay_precreate'
      points: number
      amountCents: number
      qrCode?: string
      payPageUrl?: string
    }
  | { ok: false; error: string; status: number }
> {
  const cfgResult = loadAlipayPayConfig()
  if (!cfgResult.ok) {
    return { ok: false, error: cfgResult.error, status: 503 }
  }
  const cfg = cfgResult.config
  const description = `灵祺星选积分充值${checkout.points.toLocaleString('zh-CN')}积分`
  const attach = JSON.stringify({ rid: checkout.id, role: checkout.role, kind: 'points' })
  const outTradeNo = String(checkout.outTradeNo || '').trim()
  if (!outTradeNo) return { ok: false, error: 'missing_out_trade_no', status: 400 }

  try {
    const order = await createAlipayMembershipPayOrder({
      cfg,
      outTradeNo,
      description,
      amountCents: checkout.amountCents,
      attach,
    })
    checkout.payMode = order.payMode
    return {
      ok: true,
      requestId: checkout.id,
      outTradeNo,
      channel: 'alipay',
      payMode: order.payMode,
      points: checkout.points,
      amountCents: checkout.amountCents,
      qrCode: order.qrCode,
      payPageUrl: order.payPageUrl,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      status: 502,
    }
  }
}

export async function pollPointsAlipayPayFromSnapshot(
  data: RegistrySnapshot,
  outTradeNo: string,
  cfg: AlipayPayConfig,
): Promise<
  | { ok: true; status: 'pending' | 'paid' | 'expired'; requestId?: string; newBalance?: number }
  | { ok: false; error: string }
> {
  const list = data.mpPointsCheckoutRequests ?? []
  const hit = list.find((r) => r.outTradeNo === outTradeNo)
  if (!hit) return { ok: false, error: 'order_not_found' }
  if (hit.status === 'confirmed') {
    return { ok: true, status: 'paid', requestId: hit.id }
  }
  if (rejectPointsCheckoutIfExpired(hit)) {
    return { ok: true, status: 'expired', requestId: hit.id }
  }
  if (hit.status === 'rejected') {
    return { ok: true, status: 'expired', requestId: hit.id }
  }

  try {
    const q = await queryAlipayOrderByOutTradeNo(cfg, outTradeNo)
    const paid = q.tradeStatus === 'TRADE_SUCCESS' || q.tradeStatus === 'TRADE_FINISHED'
    if (paid) {
      const result = confirmPointsPayFromSnapshot(data, outTradeNo, {
        transactionId: q.tradeNo,
        channel: 'alipay',
      })
      if (!result.ok) return result
      return {
        ok: true,
        status: 'paid',
        requestId: result.requestId,
        newBalance: result.newBalance,
      }
    }
    return { ok: true, status: 'pending' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
