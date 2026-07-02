import type { MpAccountRow } from './mpAccountAuth.js'
import type { RegistrySnapshot } from './opsRegistryTypes.js'
import {
  buildMembershipCheckoutBase,
  confirmMembershipPayFromSnapshot,
} from './mpMembershipPayShared.js'
import {
  buildJsapiPayParams,
  createWechatJsapiOrder,
  createWechatNativeOrder,
  loadWechatPayConfig,
  queryWechatOrderByOutTradeNo,
  type WechatPayConfig,
} from './wechatPayV3.js'

export { computeMembershipExpiresAtIso } from './mpMembershipPayShared.js'
export { confirmMembershipWechatPayFromSnapshot } from './mpMembershipPayShared.js'

export async function createMembershipWechatPrepayFromSnapshot(
  data: RegistrySnapshot,
  account: MpAccountRow,
  body: Record<string, unknown>,
): Promise<
  | {
      ok: true
      requestId: string
      outTradeNo: string
      payMode: 'wechat_native' | 'wechat_jsapi'
      codeUrl?: string
      jsapiParams?: ReturnType<typeof buildJsapiPayParams>
    }
  | { ok: false; error: string; status: number }
> {
  const cfgResult = loadWechatPayConfig()
  if (!cfgResult.ok) {
    return { ok: false, error: cfgResult.error, status: 503 }
  }
  const cfg = cfgResult.config

  const payModeRaw = String(body.payMode || 'native').trim()
  const payMode = payModeRaw === 'jsapi' ? ('wechat_jsapi' as const) : ('wechat_native' as const)

  const base = buildMembershipCheckoutBase(data, account, body, {
    channel: 'wechat',
    payMode,
  })
  if (!base.ok) return base

  const { checkout, description } = base
  const attach = JSON.stringify({ rid: checkout.id, role: checkout.role, plan: checkout.planId })

  try {
    if (checkout.payMode === 'wechat_jsapi') {
      const openid = String(body.openid || account.openid || '').trim()
      if (!openid) return { ok: false, error: 'missing_openid', status: 400 }
      const { prepayId } = await createWechatJsapiOrder({
        cfg,
        outTradeNo: checkout.outTradeNo!,
        description,
        amountCents: checkout.amountCents,
        openid,
        attach,
      })
      checkout.wechatPrepayId = prepayId
      return {
        ok: true,
        requestId: checkout.id,
        outTradeNo: checkout.outTradeNo!,
        payMode: 'wechat_jsapi',
        jsapiParams: buildJsapiPayParams(cfg, prepayId),
      }
    }

    const { codeUrl, prepayId } = await createWechatNativeOrder({
      cfg,
      outTradeNo: checkout.outTradeNo!,
      description,
      amountCents: checkout.amountCents,
      attach,
    })
    if (prepayId) checkout.wechatPrepayId = prepayId
    return {
      ok: true,
      requestId: checkout.id,
      outTradeNo: checkout.outTradeNo!,
      payMode: 'wechat_native',
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

export async function pollMembershipWechatPayFromSnapshot(
  data: RegistrySnapshot,
  outTradeNo: string,
  cfg: WechatPayConfig,
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
    const q = await queryWechatOrderByOutTradeNo(cfg, outTradeNo)
    if (q.tradeState === 'SUCCESS') {
      const result = confirmMembershipPayFromSnapshot(data, outTradeNo, {
        transactionId: q.transactionId,
        channel: 'wechat',
      })
      if (!result.ok) return result
      return { ok: true, status: 'paid', requestId: result.requestId }
    }
    return { ok: true, status: 'pending' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
