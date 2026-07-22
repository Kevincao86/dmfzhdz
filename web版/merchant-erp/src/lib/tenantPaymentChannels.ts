import type { SupabaseClient } from '@supabase/supabase-js'
import { formatThrowableMessage, tenantPayErrorMessage } from './formatDisplayError.js'
import {
  createAlipayMembershipPayOrder,
  loadAlipayPayConfig,
  queryAlipayOrderByOutTradeNo,
} from './alipayPay.js'
import {
  createDouyinPayNativeOrder,
  isDouyinPayOrderSuccess,
  loadDouyinPayMerchantConfig,
  queryDouyinPayOrderByOutTradeNo,
} from './douyinPayV1.js'
import {
  confirmTenantOnlinePaymentOrder,
  createTenantOnlinePaymentOrder,
  findTenantOrderByOutTradeNo,
  isTenantOrderPayExpired,
  purchaseTenantOrderWithWallet,
  tenantOrderDescription,
  type TenantOrderKind,
  type TenantPayChannel,
  type TenantPaymentOrderRow,
} from './tenantPaymentShared.js'
import {
  buildJsapiPayParams,
  createWechatJsapiOrder,
  createWechatNativeOrder,
  loadWechatPayConfig,
  queryWechatOrderByOutTradeNo,
  resolveErpJsapiPayAppId,
  wechatNativeCodeUrlToDataUrl,
  withWechatPayAppId,
} from './wechatPayV3.js'
import {
  buildVirtualPaymentClientParams,
  loadWechatVirtualPayConfig,
  mergeXpayOpenIdIntoClientNote,
  parseXpayOpenIdFromClientNote,
  queryXpayOrder,
  resolveXpayProductId,
} from './wechatVirtualPay.js'

export type { TenantPayChannel, TenantOrderKind } from './tenantPaymentShared.js'

export type TenantPrepayResult =
  | {
      ok: true
      orderId: string
      outTradeNo: string
      payMode: string
      codeUrl?: string
      qrCode?: string
      payPageUrl?: string
      jsapiParams?: ReturnType<typeof buildJsapiPayParams>
      virtualPayParams?: {
        mode: 'short_series_goods'
        signData: string
        paySig: string
        signature: string
      }
    }
  | { ok: false; error: string; status: number; message?: string; missing?: string[] }

export async function createTenantPayPrepay(
  admin: SupabaseClient,
  input: {
    tenantId: string
    userId: string | null
    orderKind: TenantOrderKind
    amountCents: number
    channel: TenantPayChannel
    clientNote?: string | null
    /** 小程序：virtual=虚拟支付；jsapi=旧 JSAPI；Web 扫码 native */
    wechatPayMode?: 'native' | 'jsapi' | 'virtual'
    wechatOpenId?: string | null
    wechatSessionKey?: string | null
  },
): Promise<TenantPrepayResult> {
  const channel = input.channel
  const description = tenantOrderDescription(input.orderKind, input.amountCents)

  const createOrder = async (payMode: string) => {
    try {
      return await createTenantOnlinePaymentOrder(admin, { ...input, payMode })
    } catch (e) {
      const msg = formatThrowableMessage(e, 'create_order_failed')
      if (/schema cache|could not find the .* column of .* in the schema cache/i.test(msg)) {
        return {
          ok: false as const,
          error: 'postgrest_schema_cache_stale',
          message: tenantPayErrorMessage('postgrest_schema_cache_stale'),
          status: 503,
        }
      }
      if (
        /relation .* does not exist|could not find the table|column .* does not exist/i.test(msg) &&
        !/schema cache/i.test(msg)
      ) {
        return {
          ok: false as const,
          error: 'db_migration_required',
          message: tenantPayErrorMessage('db_migration_required'),
          status: 503,
        }
      }
      return {
        ok: false as const,
        error: msg || 'create_order_failed',
        message: msg || tenantPayErrorMessage('create_order_failed'),
        status: 502,
      }
    }
  }

  const fail = (error: string, status: number, missing?: string[]) => ({
    ok: false as const,
    error,
    message: tenantPayErrorMessage(error, missing),
    status,
    ...(missing?.length ? { missing } : {}),
  })

  if (channel === 'wechat') {
    // —— 小程序虚拟支付（审核要求：虚拟商品必须 requestVirtualPayment）——
    if (input.wechatPayMode === 'virtual') {
      const xpayCfg = loadWechatVirtualPayConfig()
      if (!xpayCfg.ok) return fail(xpayCfg.error, 503, xpayCfg.missing)
      const openid = String(input.wechatOpenId || '').trim()
      const sessionKey = String(input.wechatSessionKey || '').trim()
      if (!openid) return fail('missing_openid', 400)
      if (!sessionKey) return fail('missing_session_key', 400)

      const noteWithOpenId = mergeXpayOpenIdIntoClientNote(input.clientNote, openid)
      const orderResult = await createTenantOnlinePaymentOrder(admin, {
        ...input,
        clientNote: noteWithOpenId,
        payMode: 'wechat_virtual',
      })
      if ('ok' in orderResult && orderResult.ok === false) return orderResult
      const order = orderResult as TenantPaymentOrderRow
      const productId = resolveXpayProductId(xpayCfg.config, input.orderKind, input.amountCents)
      const attach = JSON.stringify({
        oid: order.id,
        kind: input.orderKind,
        cents: input.amountCents,
      }).slice(0, 1024)
      try {
        const virtualPayParams = buildVirtualPaymentClientParams({
          config: xpayCfg.config,
          sessionKey,
          outTradeNo: order.out_trade_no!,
          productId,
          goodsPriceCents: input.amountCents,
          attach,
        })
        return {
          ok: true,
          orderId: order.id,
          outTradeNo: order.out_trade_no!,
          payMode: 'wechat_virtual',
          virtualPayParams,
        }
      } catch (e) {
        await admin.from('merchant_payment_orders').update({ status: 'cancelled' }).eq('id', order.id)
        return {
          ok: false,
          error: 'xpay_prepay_failed',
          message: formatThrowableMessage(e, 'xpay_prepay_failed'),
          status: 502,
        }
      }
    }

    const cfgResult = loadWechatPayConfig()
    if (!cfgResult.ok) return fail(cfgResult.error, 503, cfgResult.missing)
    const cfg = cfgResult.config
    // 与达人小程序一致：小程序传 jsapi → 必须 JSAPI 调起；Web 扫码才走 native
    const wechatPayMode = input.wechatPayMode === 'jsapi' ? 'wechat_jsapi' : 'wechat_native'
    const orderResult = await createOrder(wechatPayMode)
    if ('ok' in orderResult && orderResult.ok === false) return orderResult
    const order = orderResult as TenantPaymentOrderRow
    const attach = JSON.stringify({ oid: order.id, kind: input.orderKind }).slice(0, 128)
    try {
      if (wechatPayMode === 'wechat_jsapi') {
        const openid = String(input.wechatOpenId || '').trim()
        if (!openid) return fail('missing_openid', 400)
        // ERP 小程序 openid 对应 ERP_MP AppID（等同达人用 MP_WECHAT_APPID）
        const erpAppId = resolveErpJsapiPayAppId()
        if (!erpAppId) return fail('erp_wx_not_configured', 503)
        const jsapiCfg = withWechatPayAppId(cfg, erpAppId)
        const { prepayId } = await createWechatJsapiOrder({
          cfg: jsapiCfg,
          outTradeNo: order.out_trade_no!,
          description,
          amountCents: input.amountCents,
          openid,
          attach,
        })
        return {
          ok: true,
          orderId: order.id,
          outTradeNo: order.out_trade_no!,
          payMode: 'wechat_jsapi',
          jsapiParams: buildJsapiPayParams(jsapiCfg, prepayId),
        }
      }
      const { codeUrl } = await createWechatNativeOrder({
        cfg,
        outTradeNo: order.out_trade_no!,
        description,
        amountCents: input.amountCents,
        attach,
      })
      let qrCode = ''
      try {
        qrCode = await wechatNativeCodeUrlToDataUrl(codeUrl)
      } catch {
        qrCode = ''
      }
      return {
        ok: true,
        orderId: order.id,
        outTradeNo: order.out_trade_no!,
        payMode: 'wechat_native',
        codeUrl,
        qrCode: qrCode || undefined,
      }
    } catch (e) {
      await admin.from('merchant_payment_orders').update({ status: 'cancelled' }).eq('id', order.id)
      const msg = formatThrowableMessage(e, 'wechat_prepay_failed')
      if (/appid和openid不匹配|openid.*appid|appid.*openid/i.test(msg)) {
        return {
          ok: false,
          error: 'wechat_appid_openid_mismatch',
          message: tenantPayErrorMessage('wechat_appid_openid_mismatch'),
          status: 400,
        }
      }
      if (/appid和mch_id不匹配|mch_id.*appid|appid.*mch|APPID_MCHID_NOT_MATCH/i.test(msg)) {
        return {
          ok: false,
          error: 'wechat_appid_mch_mismatch',
          message: tenantPayErrorMessage('wechat_appid_mch_mismatch'),
          status: 400,
        }
      }
      return { ok: false, error: msg, message: msg, status: 502 }
    }
  }

  if (channel === 'alipay') {
    const cfgResult = loadAlipayPayConfig()
    if (!cfgResult.ok) return fail(cfgResult.error, 503, cfgResult.missing)
    const cfg = cfgResult.config
    const orderResult = await createOrder(
      cfg.payProduct === 'precreate' ? 'alipay_precreate' : 'alipay_page',
    )
    if ('ok' in orderResult && orderResult.ok === false) return orderResult
    const order = orderResult as TenantPaymentOrderRow
    try {
      const pay = await createAlipayMembershipPayOrder({
        cfg,
        outTradeNo: order.out_trade_no!,
        description,
        amountCents: input.amountCents,
      })
      return {
        ok: true,
        orderId: order.id,
        outTradeNo: order.out_trade_no!,
        payMode: pay.payMode,
        qrCode: pay.qrCode,
        payPageUrl: pay.payPageUrl,
        codeUrl: pay.qrCode,
      }
    } catch (e) {
      await admin.from('merchant_payment_orders').update({ status: 'cancelled' }).eq('id', order.id)
      const msg = formatThrowableMessage(e, 'alipay_prepay_failed')
      return { ok: false, error: msg, message: msg, status: 502 }
    }
  }

  if (channel === 'douyin') {
    const cfgResult = loadDouyinPayMerchantConfig()
    if (!cfgResult.ok) return fail(cfgResult.error, 503, cfgResult.missing)
    const cfg = cfgResult.config
    const orderResult = await createOrder('douyin_native')
    if ('ok' in orderResult && orderResult.ok === false) return orderResult
    const order = orderResult as TenantPaymentOrderRow
    try {
      const { codeUrl } = await createDouyinPayNativeOrder({
        cfg,
        outTradeNo: order.out_trade_no!,
        description,
        amountCents: input.amountCents,
        attach: order.id.slice(0, 64),
      })
      return {
        ok: true,
        orderId: order.id,
        outTradeNo: order.out_trade_no!,
        payMode: 'douyin_native',
        codeUrl,
        qrCode: codeUrl,
      }
    } catch (e) {
      await admin.from('merchant_payment_orders').update({ status: 'cancelled' }).eq('id', order.id)
      const msg = formatThrowableMessage(e, 'douyin_prepay_failed')
      return { ok: false, error: msg, message: msg, status: 502 }
    }
  }

  return fail('unsupported_channel', 400)
}

export type TenantWalletPayResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string; status: number; message?: string }

export async function purchaseTenantWithWallet(
  admin: SupabaseClient,
  input: {
    tenantId: string
    userId: string | null
    orderKind: TenantOrderKind
    amountCents: number
    clientNote?: string | null
  },
): Promise<TenantWalletPayResult> {
  if (input.orderKind === 'recharge') {
    return {
      ok: false,
      error: 'unsupported_order_kind',
      message: '账户充值请使用微信/支付宝/抖音扫码支付',
      status: 400,
    }
  }
  if (input.orderKind !== 'subscription' && input.orderKind !== 'points_recharge') {
    return { ok: false, error: 'unsupported_order_kind', status: 400 }
  }
  const result = await purchaseTenantOrderWithWallet(admin, {
    tenantId: input.tenantId,
    userId: input.userId,
    orderKind: input.orderKind,
    amountCents: input.amountCents,
    clientNote: input.clientNote,
  })
  if (!result.ok) {
    const status = result.error === 'insufficient_wallet_balance' ? 402 : 400
    return { ok: false, error: result.error, message: result.message, status }
  }
  return { ok: true, orderId: result.orderId }
}

export async function pollTenantPayOrder(
  admin: SupabaseClient,
  outTradeNo: string,
): Promise<
  | { ok: true; status: 'pending' | 'paid' | 'expired' | 'cancelled'; orderId?: string }
  | { ok: false; error: string }
> {
  const order = await findTenantOrderByOutTradeNo(admin, outTradeNo)
  if (!order) return { ok: false, error: 'order_not_found' }
  if (order.status === 'confirmed') {
    return { ok: true, status: 'paid', orderId: order.id }
  }
  if (order.status === 'cancelled') return { ok: true, status: 'cancelled', orderId: order.id }
  if (isTenantOrderPayExpired(order)) {
    await admin
      .from('merchant_payment_orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', order.id)
      .eq('status', 'pending')
    return { ok: true, status: 'expired', orderId: order.id }
  }

  const channel = String(order.pay_channel || '').trim() as TenantPayChannel
  const tradeNo = String(order.out_trade_no || '').trim()
  if (!tradeNo) return { ok: false, error: 'missing_out_trade_no' }

  try {
    if (channel === 'wechat') {
      const payMode = String(order.pay_mode || '').trim()
      if (payMode === 'wechat_virtual') {
        const xpayCfg = loadWechatVirtualPayConfig()
        if (!xpayCfg.ok) return { ok: false, error: xpayCfg.error }
        const openid = parseXpayOpenIdFromClientNote(order.client_note)
        try {
          const q = await queryXpayOrder({
            config: xpayCfg.config,
            outTradeNo: tradeNo,
            openid: openid || undefined,
          })
          if (q.paid) {
            const confirmed = await confirmTenantOnlinePaymentOrder(admin, order, {
              transactionId: q.transactionId,
              verifiedCents: order.amount_cents,
            })
            if (!confirmed.ok) return { ok: false, error: confirmed.error }
            return { ok: true, status: 'paid', orderId: order.id }
          }
        } catch {
          /* 查单失败保持 pending，等发货推送或下次轮询 */
        }
        return { ok: true, status: 'pending', orderId: order.id }
      }

      const cfgResult = loadWechatPayConfig()
      if (!cfgResult.ok) return { ok: false, error: cfgResult.error }
      const q = await queryWechatOrderByOutTradeNo(cfgResult.config, tradeNo)
      if (q.tradeState === 'SUCCESS') {
        const confirmed = await confirmTenantOnlinePaymentOrder(admin, order, {
          transactionId: q.transactionId,
          verifiedCents: order.amount_cents,
        })
        if (!confirmed.ok) return { ok: false, error: confirmed.error }
        return { ok: true, status: 'paid', orderId: order.id }
      }
      return { ok: true, status: 'pending', orderId: order.id }
    }

    if (channel === 'alipay') {
      const cfgResult = loadAlipayPayConfig()
      if (!cfgResult.ok) return { ok: false, error: cfgResult.error }
      const q = await queryAlipayOrderByOutTradeNo(cfgResult.config, tradeNo)
      if (q.tradeStatus === 'TRADE_SUCCESS' || q.tradeStatus === 'TRADE_FINISHED') {
        const confirmed = await confirmTenantOnlinePaymentOrder(admin, order, {
          transactionId: q.tradeNo,
          verifiedCents: order.amount_cents,
        })
        if (!confirmed.ok) return { ok: false, error: confirmed.error }
        return { ok: true, status: 'paid', orderId: order.id }
      }
      return { ok: true, status: 'pending', orderId: order.id }
    }

    if (channel === 'douyin') {
      const cfgResult = loadDouyinPayMerchantConfig()
      if (!cfgResult.ok) return { ok: false, error: cfgResult.error }
      const q = await queryDouyinPayOrderByOutTradeNo(cfgResult.config, tradeNo)
      if (isDouyinPayOrderSuccess(q.tradeState)) {
        const confirmed = await confirmTenantOnlinePaymentOrder(admin, order, {
          transactionId: q.transactionId,
          verifiedCents: order.amount_cents,
        })
        if (!confirmed.ok) return { ok: false, error: confirmed.error }
        return { ok: true, status: 'paid', orderId: order.id }
      }
      return { ok: true, status: 'pending', orderId: order.id }
    }
  } catch (e) {
    return { ok: false, error: formatThrowableMessage(e, 'poll_failed') }
  }

  return { ok: true, status: 'pending', orderId: order.id }
}

export async function confirmTenantPayFromNotify(
  admin: SupabaseClient,
  outTradeNo: string,
  transactionId?: string | null,
): Promise<boolean> {
  const order = await findTenantOrderByOutTradeNo(admin, outTradeNo)
  if (!order || !String(order.out_trade_no || '').startsWith('TERP')) return false
  if (order.status === 'confirmed') return true
  const result = await confirmTenantOnlinePaymentOrder(admin, order, { transactionId })
  return result.ok
}

export type TenantBillingSummary = {
  membershipPlan: string
  membershipPlanLabel: string
  serviceExpireAt: string | null
  subscriptionDays: number
  opsGiftDays: number
  remainDays: number | null
  walletBalanceCents: number
  packagePoints: number
  rechargePoints: number
  totalPoints: number
  monthlyGiftPoints: number
  giftMonth: string | null
}

export async function buildTenantBillingSummary(
  admin: SupabaseClient,
  tenantId: string,
): Promise<TenantBillingSummary> {
  const { MEMBERSHIP_PLAN_LABELS, normalizeMembershipPlan } = await import('./membershipPlan.js')
  const { computeMemberUsageRemaining } = await import('./tenantBilling.js')
  const { erpMonthlyGiftPointsForPlan } = await import('./erpPointsEconomics.js')
  const { ensureErpMonthlyGiftPointsGranted, readTenantPointsBalances } = await import('./erpPointsCore.js')

  const { data: tenant, error } = await admin
    .from('tenants')
    .select(
      'membership_plan, service_expire_at, subscription_days, ops_gift_days, official_days, wallet_balance_cents, erp_package_points_balance, erp_recharge_points_balance, erp_points_gift_month',
    )
    .eq('id', tenantId)
    .maybeSingle()
  if (error) throw error

  const plan = normalizeMembershipPlan(tenant?.membership_plan)
  await ensureErpMonthlyGiftPointsGranted(admin, tenantId, { plan })

  const refreshed = await admin
    .from('tenants')
    .select(
      'membership_plan, service_expire_at, subscription_days, ops_gift_days, official_days, wallet_balance_cents, erp_package_points_balance, erp_recharge_points_balance, erp_points_gift_month',
    )
    .eq('id', tenantId)
    .maybeSingle()

  const row = refreshed.data
  const expireIso = typeof row?.service_expire_at === 'string' ? row.service_expire_at : null
  const usage = computeMemberUsageRemaining(expireIso)
  const sub = Math.max(0, Math.floor(Number(row?.subscription_days) || 0))
  const gift = Math.max(0, Math.floor(Number(row?.ops_gift_days) || 0))
  const pts = readTenantPointsBalances(row)

  return {
    membershipPlan: plan,
    membershipPlanLabel: MEMBERSHIP_PLAN_LABELS[plan],
    serviceExpireAt: expireIso,
    subscriptionDays: sub,
    opsGiftDays: gift,
    remainDays: usage.remainDays,
    walletBalanceCents: Math.max(0, Math.floor(Number(row?.wallet_balance_cents) || 0)),
    packagePoints: pts.packagePoints,
    rechargePoints: pts.rechargePoints,
    totalPoints: pts.totalPoints,
    monthlyGiftPoints: erpMonthlyGiftPointsForPlan(plan),
    giftMonth: typeof row?.erp_points_gift_month === 'string' ? row.erp_points_gift_month : null,
  }
}

export async function listTenantPaymentOrders(
  admin: SupabaseClient,
  tenantId: string,
  limit = 50,
): Promise<TenantPaymentOrderRow[]> {
  const { data, error } = await admin
    .from('merchant_payment_orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as TenantPaymentOrderRow[]
}

export async function listTenantPointsLedger(
  admin: SupabaseClient,
  tenantId: string,
  limit = 80,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await admin
    .from('tenant_points_ledger')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (/does not exist|Could not find/i.test(error.message)) return []
    throw error
  }
  return data ?? []
}
