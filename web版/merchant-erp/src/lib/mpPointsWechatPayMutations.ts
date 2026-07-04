import type { MpAccountRow } from './mpAccountAuth.js'
import type { RegistrySnapshot } from './opsRegistryTypes.js'
import {
  buildJsapiPayParams,
  createWechatJsapiOrder,
  createWechatNativeOrder,
  loadWechatPayConfig,
  queryWechatOrderByOutTradeNo,
  type WechatPayConfig,
} from './wechatPayV3.js'
import {
  buildPointsCheckoutBase,
  confirmPointsPayFromSnapshot,
  rejectPointsCheckoutIfExpired,
} from './mpPointsPayShared.js'

export { confirmPointsPayFromSnapshot, confirmPointsWechatPayFromSnapshot } from './mpPointsPayShared.js'

export async function createPointsWechatPrepayFromSnapshot(
  data: RegistrySnapshot,
  account: MpAccountRow,
  body: Record<string, unknown>,
):
  Promise<
    | {
        ok: true
        requestId: string
        outTradeNo: string
        payMode: 'wechat_native' | 'wechat_jsapi'
        points: number
        amountCents: number
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

  const base = buildPointsCheckoutBase(data, account, body, { channel: 'wechat' })
  if (!base.ok) return base

  const { checkout, description } = base
  const attach = JSON.stringify({ rid: checkout.id, role: checkout.role, kind: 'points' })

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
        points: checkout.points,
        amountCents: checkout.amountCents,
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
      points: checkout.points,
      amountCents: checkout.amountCents,
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

export async function resumePointsWechatPayFromSnapshot(
  _data: RegistrySnapshot,
  account: MpAccountRow,
  checkout: import('./opsRegistryTypes.js').RegistryMpPointsCheckoutRequest,
  body?: Record<string, unknown>,
): Promise<
  | {
      ok: true
      requestId: string
      outTradeNo: string
      channel: 'wechat'
      payMode: 'wechat_native' | 'wechat_jsapi'
      points: number
      amountCents: number
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
  const description = `灵祺星选积分充值${checkout.points.toLocaleString('zh-CN')}积分`
  const attach = JSON.stringify({ rid: checkout.id, role: checkout.role, kind: 'points' })
  const outTradeNo = String(checkout.outTradeNo || '').trim()
  if (!outTradeNo) return { ok: false, error: 'missing_out_trade_no', status: 400 }

  try {
    if (checkout.payMode === 'wechat_jsapi') {
      const openid = String(body?.openid || account.openid || '').trim()
      if (!openid) return { ok: false, error: 'missing_openid', status: 400 }
      const { prepayId } = await createWechatJsapiOrder({
        cfg,
        outTradeNo,
        description,
        amountCents: checkout.amountCents,
        openid,
        attach,
      })
      checkout.wechatPrepayId = prepayId
      return {
        ok: true,
        requestId: checkout.id,
        outTradeNo,
        channel: 'wechat',
        payMode: 'wechat_jsapi',
        points: checkout.points,
        amountCents: checkout.amountCents,
        jsapiParams: buildJsapiPayParams(cfg, prepayId),
      }
    }

    const { codeUrl, prepayId } = await createWechatNativeOrder({
      cfg,
      outTradeNo,
      description,
      amountCents: checkout.amountCents,
      attach,
    })
    if (prepayId) checkout.wechatPrepayId = prepayId
    return {
      ok: true,
      requestId: checkout.id,
      outTradeNo,
      channel: 'wechat',
      payMode: 'wechat_native',
      points: checkout.points,
      amountCents: checkout.amountCents,
      codeUrl,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      status: 502,
    }
  }
}

export async function pollPointsWechatPayFromSnapshot(
  data: RegistrySnapshot,
  outTradeNo: string,
  cfg: WechatPayConfig,
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
    const q = await queryWechatOrderByOutTradeNo(cfg, outTradeNo)
    if (q.tradeState === 'SUCCESS') {
      const result = confirmPointsPayFromSnapshot(data, outTradeNo, {
        transactionId: q.transactionId,
        channel: 'wechat',
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
