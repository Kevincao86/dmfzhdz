import type { MpAccountRow } from './mpAccountAuth.js'
import {
  findAccountPointsCheckoutByOutTradeNo,
  rejectPointsCheckoutIfExpired,
  type MpPointsPayChannel,
} from './mpPointsPayShared.js'
import { resumePointsAlipayPayFromSnapshot } from './mpPointsAlipayPayMutations.js'
import { resumePointsDouyinPayFromSnapshot } from './mpPointsDouyinPayMutations.js'
import { resumePointsWechatPayFromSnapshot } from './mpPointsWechatPayMutations.js'
import type { RegistrySnapshot } from './opsRegistryTypes.js'

export type PointsPayResumeResult =
  | {
      ok: true
      requestId: string
      outTradeNo: string
      channel: MpPointsPayChannel
      points: number
      amountCents: number
      payMode?: string
      codeUrl?: string
      qrCode?: string
      payPageUrl?: string
      jsapiParams?: Record<string, string>
    }
  | { ok: false; error: string; status: number }

export async function resumePointsPayFromSnapshot(
  data: RegistrySnapshot,
  account: MpAccountRow,
  outTradeNo: string,
  body?: Record<string, unknown>,
): Promise<PointsPayResumeResult> {
  const accountId = String(account.id || '').trim()
  const tradeNo = String(outTradeNo || '').trim()
  if (!tradeNo) return { ok: false, error: 'missing_out_trade_no', status: 400 }

  const checkout = findAccountPointsCheckoutByOutTradeNo(data, accountId, tradeNo)
  if (!checkout) return { ok: false, error: 'order_not_found', status: 404 }
  if (rejectPointsCheckoutIfExpired(checkout)) {
    return { ok: false, error: 'order_expired', status: 410 }
  }
  if (checkout.status === 'confirmed') {
    return { ok: false, error: 'order_already_paid', status: 409 }
  }
  if (checkout.status === 'rejected') {
    return { ok: false, error: 'order_closed', status: 410 }
  }

  const channel = checkout.channel
  if (channel === 'alipay') {
    return resumePointsAlipayPayFromSnapshot(data, checkout)
  }
  if (channel === 'douyin') {
    return resumePointsDouyinPayFromSnapshot(data, checkout)
  }
  return resumePointsWechatPayFromSnapshot(data, account, checkout, body)
}
