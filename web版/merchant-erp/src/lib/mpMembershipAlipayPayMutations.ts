import type { MpAccountRow } from './mpAccountAuth.js'
import type { RegistrySnapshot } from './opsRegistryTypes.js'
import {
  createAlipayMembershipPayOrder,
  loadAlipayPayConfig,
  queryAlipayOrderByOutTradeNo,
  type AlipayPayConfig,
} from './alipayPay.js'
import {
  buildMembershipCheckoutBase,
  confirmMembershipPayFromSnapshot,
} from './mpMembershipPayShared.js'

export async function createMembershipAlipayPrepayFromSnapshot(
  data: RegistrySnapshot,
  account: MpAccountRow,
  body: Record<string, unknown>,
): Promise<
  | {
      ok: true
      requestId: string
      outTradeNo: string
      payMode: 'alipay_page' | 'alipay_precreate'
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

  const base = buildMembershipCheckoutBase(data, account, body, {
    channel: 'alipay',
    payMode: cfg.payProduct === 'precreate' ? 'alipay_precreate' : 'alipay_page',
  })
  if (!base.ok) return base

  const { checkout, description } = base
  const attach = JSON.stringify({ rid: checkout.id, role: checkout.role, plan: checkout.planId })

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

export async function pollMembershipAlipayPayFromSnapshot(
  data: RegistrySnapshot,
  outTradeNo: string,
  cfg: AlipayPayConfig,
): Promise<
  | { ok: true; status: 'pending' | 'paid'; requestId?: string }
  | { ok: false; error: string }
> {
  const list = data.mpMembershipCheckoutRequests ?? []
  const hit = list.find((r) => r.outTradeNo === outTradeNo)
  if (!hit) return { ok: false, error: 'order_not_found' }
  if (hit.status === 'confirmed') {
    return { ok: true, status: 'paid', requestId: hit.id }
  }

  try {
    const q = await queryAlipayOrderByOutTradeNo(cfg, outTradeNo)
    const paid = q.tradeStatus === 'TRADE_SUCCESS' || q.tradeStatus === 'TRADE_FINISHED'
    if (paid) {
      const result = confirmMembershipPayFromSnapshot(data, outTradeNo, {
        transactionId: q.tradeNo,
        channel: 'alipay',
      })
      if (!result.ok) return result
      return { ok: true, status: 'paid', requestId: result.requestId }
    }
    return { ok: true, status: 'pending' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
