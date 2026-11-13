import type { MpMembershipOrderRow, MpPointsOrderRow } from './mpApi'

export type { MpMembershipOrderRow, MpPointsOrderRow }

export function yuanFromCents(cents: number): string {
  return (cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function paymentOrderStatusLabel(status: 'pending' | 'confirmed' | 'rejected'): string {
  if (status === 'confirmed') return '已完成'
  if (status === 'rejected') return '已关闭'
  return '待支付'
}

export function paymentOrderStatusClass(status: 'pending' | 'confirmed' | 'rejected'): string {
  if (status === 'confirmed') return 'bg-emerald-100 text-emerald-700'
  if (status === 'rejected') return 'bg-slate-100 text-slate-600'
  return 'bg-amber-100 text-amber-800'
}

export function membershipPlanLabel(planId: string): string {
  const map: Record<string, string> = {
    basic: '基础版',
    pro: '专业版',
    flagship: '旗舰版',
    enterprise: '企业版',
  }
  return map[planId] || planId
}

export function membershipBillingLabel(billing: 'monthly' | 'yearly'): string {
  return billing === 'yearly' ? '年付' : '月付'
}

export function payModeLabel(payMode?: string): string {
  if (payMode === 'wechat_native') return '微信扫码'
  if (payMode === 'wechat_jsapi') return '微信 JSAPI'
  if (payMode === 'alipay_precreate') return '支付宝扫码'
  if (payMode === 'alipay_page') return '支付宝'
  if (payMode === 'douyin_native') return '抖音扫码'
  if (payMode === 'manual') return '手动申报'
  return '—'
}

/** 积分充值待支付窗口（15 分钟），与后端 MP_POINTS_CHECKOUT_PAY_TTL_MS 一致 */
export const MP_POINTS_PAY_TTL_MS = 15 * 60 * 1000

export function pointsPayRemainingMs(createdAt: string, nowMs = Date.now()): number {
  const created = new Date(createdAt).getTime()
  if (!Number.isFinite(created)) return 0
  return Math.max(0, created + MP_POINTS_PAY_TTL_MS - nowMs)
}

export function formatPayCountdown(remainingMs: number): string {
  const totalSec = Math.ceil(remainingMs / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export function myOrdersPath(opts?: {
  tab?: 'spend' | 'quota' | 'membership' | 'recharge' | 'points'
  outTradeNo?: string
}): string {
  const params = new URLSearchParams()
  if (opts?.tab && opts.tab !== 'spend') {
    params.set('tab', opts.tab === 'points' ? 'recharge' : opts.tab)
  }
  if (opts?.outTradeNo) params.set('outTradeNo', opts.outTradeNo)
  const q = params.toString()
  return q ? `/profile/my-orders?${q}` : '/profile/my-orders'
}
