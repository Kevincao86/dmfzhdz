import type { MpAccountRow } from './mpAccountAuth.js'
import type { RegistrySnapshot } from './opsRegistryTypes.js'
import {
  createDouyinPayNativeOrder,
  isDouyinPayOrderSuccess,
  loadDouyinPayMerchantConfig,
  queryDouyinPayOrderByOutTradeNo,
  type DouyinPayMerchantConfig,
} from './douyinPayV1.js'
import { buildPointsCheckoutBase, confirmPointsPayFromSnapshot, rejectPointsCheckoutIfExpired } from './mpPointsPayShared.js'
import type { RegistryMpPointsCheckoutRequest } from './opsRegistryTypes.js'

export async function createPointsDouyinPrepayFromSnapshot(
  data: RegistrySnapshot,
  account: MpAccountRow,
  body: Record<string, unknown>,
): Promise<
  | {
      ok: true
      requestId: string
      outTradeNo: string
      payMode: 'douyin_native'
      points: number
      amountCents: number
      qrCode: string
      codeUrl: string
    }
  | { ok: false; error: string; status: number }
> {
  const merchantCfgResult = loadDouyinPayMerchantConfig()
  if (!merchantCfgResult.ok) {
    return { ok: false, error: merchantCfgResult.error, status: 503 }
  }
  const merchantCfg = merchantCfgResult.config

  const base = buildPointsCheckoutBase(data, account, body, {
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
      points: checkout.points,
      amountCents: checkout.amountCents,
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

export async function resumePointsDouyinPayFromSnapshot(
  _data: RegistrySnapshot,
  checkout: RegistryMpPointsCheckoutRequest,
): Promise<
  | {
      ok: true
      requestId: string
      outTradeNo: string
      channel: 'douyin'
      payMode: 'douyin_native'
      points: number
      amountCents: number
      qrCode: string
      codeUrl: string
    }
  | { ok: false; error: string; status: number }
> {
  const merchantCfgResult = loadDouyinPayMerchantConfig()
  if (!merchantCfgResult.ok) {
    return { ok: false, error: merchantCfgResult.error, status: 503 }
  }
  const merchantCfg = merchantCfgResult.config
  const description = `灵祺星选积分充值${checkout.points.toLocaleString('zh-CN')}积分`
  const attach = checkout.id.slice(0, 64)
  const outTradeNo = String(checkout.outTradeNo || '').trim()
  if (!outTradeNo) return { ok: false, error: 'missing_out_trade_no', status: 400 }

  try {
    const { codeUrl } = await createDouyinPayNativeOrder({
      cfg: merchantCfg,
      outTradeNo,
      description,
      amountCents: checkout.amountCents,
      attach,
    })
    return {
      ok: true,
      requestId: checkout.id,
      outTradeNo,
      channel: 'douyin',
      payMode: 'douyin_native',
      points: checkout.points,
      amountCents: checkout.amountCents,
      qrCode: codeUrl,
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

export async function pollPointsDouyinPayFromSnapshot(
  data: RegistrySnapshot,
  outTradeNo: string,
  merchantCfg?: DouyinPayMerchantConfig,
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
    const cfgResult = merchantCfg
      ? { ok: true as const, config: merchantCfg }
      : loadDouyinPayMerchantConfig()
    if (!cfgResult.ok) return { ok: false, error: 'douyinpay_not_configured' }
    const cfg = cfgResult.config
    const q = await queryDouyinPayOrderByOutTradeNo(cfg, outTradeNo)
    if (isDouyinPayOrderSuccess(q.tradeState)) {
      const result = confirmPointsPayFromSnapshot(data, outTradeNo, {
        transactionId: q.transactionId,
        channel: 'douyin',
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
