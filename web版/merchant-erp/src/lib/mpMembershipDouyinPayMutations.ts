import type { MpAccountRow } from './mpAccountAuth.js'
import type { RegistrySnapshot } from './opsRegistryTypes.js'
import {
  buildDouyinLaunchPayForCheckout,
  buildDouyinMembershipOrderData,
  buildDouyinRequestOrderAuthorization,
  isDouyinOrderPaid,
  loadDouyinPayConfig,
  queryDouyinOrderByOutOrderNo,
} from './douyinTradePay.js'
import {
  createDouyinPayNativeOrder,
  isDouyinPayOrderSuccess,
  loadDouyinPayMerchantConfig,
  queryDouyinPayOrderByOutTradeNo,
  type DouyinPayMerchantConfig,
} from './douyinPayV1.js'
import {
  buildMembershipCheckoutBase,
  confirmMembershipPayFromSnapshot,
} from './mpMembershipPayShared.js'
import {
  findMembershipPlanVersion,
  listMembershipPlanVersions,
} from './mpMembershipCatalog.js'

function membershipDescriptionFromCheckout(
  data: RegistrySnapshot,
  checkout: { planId: string; billing: 'monthly' | 'yearly'; role: string },
): string {
  const versions = listMembershipPlanVersions(data, checkout.role as 'pr' | 'talent' | 'shoot' | 'edit')
  const plan = findMembershipPlanVersion(versions, checkout.planId)
  const billingLabel = checkout.billing === 'yearly' ? '年付' : '月付'
  return `灵祺星选${plan?.name || checkout.planId}${billingLabel}`
}

export async function createMembershipDouyinPrepayFromSnapshot(
  data: RegistrySnapshot,
  account: MpAccountRow,
  body: Record<string, unknown>,
): Promise<
  | {
      ok: true
      requestId: string
      outTradeNo: string
      payMode: 'douyin_native' | 'douyin_request_order'
      data?: string
      byteAuthorization?: string
      qrCode?: string
      codeUrl?: string
    }
  | { ok: false; error: string; status: number }
> {
  const nativeMode =
    String(body.payMode || '').trim() === 'native' || body.native === true || body.native === '1'

  if (nativeMode) {
    const merchantCfgResult = loadDouyinPayMerchantConfig()
    if (!merchantCfgResult.ok) {
      return { ok: false, error: merchantCfgResult.error, status: 503 }
    }
    const merchantCfg = merchantCfgResult.config

    const base = buildMembershipCheckoutBase(data, account, body, {
      channel: 'douyin',
      payMode: 'douyin_native',
    })
    if (!base.ok) return base

    const { checkout, description } = base
    const attach = checkout.id.slice(0, 64)

    try {
      const { codeUrl } = await createDouyinPayNativeOrder({
        cfg: merchantCfg,
        outTradeNo: checkout.outTradeNo!,
        description,
        amountCents: checkout.amountCents,
        attach,
      })
      return {
        ok: true,
        requestId: checkout.id,
        outTradeNo: checkout.outTradeNo!,
        payMode: 'douyin_native',
        qrCode: codeUrl,
        codeUrl,
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

  const cfgResult = loadDouyinPayConfig()
  if (!cfgResult.ok) {
    return { ok: false, error: cfgResult.error, status: 503 }
  }
  const cfg = cfgResult.config

  const base = buildMembershipCheckoutBase(data, account, body, {
    channel: 'douyin',
    payMode: 'douyin_request_order',
  })
  if (!base.ok) return base

  const { checkout, description } = base
  const orderData = buildDouyinMembershipOrderData({
    cfg,
    outOrderNo: checkout.outTradeNo!,
    totalAmountCents: checkout.amountCents,
    title: description,
  })
  const signed = buildDouyinRequestOrderAuthorization(cfg, orderData)

  return {
    ok: true,
    requestId: checkout.id,
    outTradeNo: checkout.outTradeNo!,
    payMode: 'douyin_request_order',
    data: signed.data,
    byteAuthorization: signed.byteAuthorization,
  }
}

export function launchMembershipDouyinPayFromSnapshot(
  data: RegistrySnapshot,
  outTradeNo: string,
):
  | {
      ok: true
      requestId: string
      outTradeNo: string
      data: string
      byteAuthorization: string
    }
  | { ok: false; error: string; status: number } {
  const cfgResult = loadDouyinPayConfig()
  if (!cfgResult.ok) {
    return { ok: false, error: cfgResult.error, status: 503 }
  }
  const cfg = cfgResult.config

  const list = data.mpMembershipCheckoutRequests ?? []
  const checkout = list.find((r) => r.outTradeNo === outTradeNo)
  if (!checkout) return { ok: false, error: 'order_not_found', status: 404 }
  if (checkout.status === 'confirmed') {
    return { ok: false, error: 'order_already_paid', status: 400 }
  }
  if (checkout.channel !== 'douyin') {
    return { ok: false, error: 'order_not_douyin', status: 400 }
  }

  const description = membershipDescriptionFromCheckout(data, checkout)
  const signed = buildDouyinLaunchPayForCheckout(cfg, checkout, description)
  return {
    ok: true,
    requestId: checkout.id,
    outTradeNo,
    data: signed.data,
    byteAuthorization: signed.byteAuthorization,
  }
}

export async function pollMembershipDouyinPayFromSnapshot(
  data: RegistrySnapshot,
  outTradeNo: string,
  merchantCfg?: DouyinPayMerchantConfig,
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
    if (hit.payMode === 'douyin_native') {
      const cfgResult = merchantCfg
        ? { ok: true as const, config: merchantCfg }
        : loadDouyinPayMerchantConfig()
      if (!cfgResult.ok) return { ok: false, error: 'douyinpay_not_configured' }
      const cfg = cfgResult.config
      const q = await queryDouyinPayOrderByOutTradeNo(cfg, outTradeNo)
      if (isDouyinPayOrderSuccess(q.tradeState)) {
        const result = confirmMembershipPayFromSnapshot(data, outTradeNo, {
          transactionId: q.transactionId,
          channel: 'douyin',
        })
        if (!result.ok) return result
        return { ok: true, status: 'paid', requestId: result.requestId }
      }
      return { ok: true, status: 'pending' }
    }

    const q = await queryDouyinOrderByOutOrderNo(outTradeNo)
    if (isDouyinOrderPaid(q.payStatus)) {
      const result = confirmMembershipPayFromSnapshot(data, outTradeNo, {
        transactionId: q.orderId,
        channel: 'douyin',
      })
      if (!result.ok) return result
      return { ok: true, status: 'paid', requestId: result.requestId }
    }
    return { ok: true, status: 'pending' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
