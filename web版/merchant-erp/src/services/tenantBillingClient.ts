import { supabase } from '../lib/supabaseClient'
import { formatThrowableMessage, tenantPayErrorMessage } from '../lib/formatDisplayError'

const BILLING_API = '/erp-api/meoo-tenant-billing'

function billingApiErrorMessage(json: Record<string, unknown>, statusText: string): string {
  const message = formatThrowableMessage(json.message, '')
  if (message) return message
  const detail = formatThrowableMessage(json.detail, '')
  if (detail) return detail
  const errRaw = formatThrowableMessage(json.error, '')
  if (errRaw) {
    const missing = Array.isArray(json.missing)
      ? json.missing.filter((x): x is string => typeof x === 'string')
      : undefined
    const mapped = tenantPayErrorMessage(errRaw, missing)
    return mapped !== errRaw ? mapped : errRaw
  }
  return statusText || '请求失败'
}

async function billingFetch<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('未配置 Supabase')
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('请先登录')

  const res = await fetch(BILLING_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || json.ok === false) {
    throw new Error(billingApiErrorMessage(json, res.statusText))
  }
  return json as T
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

export type TenantPaymentOrder = {
  id: string
  order_kind: string
  amount_cents: number
  status: string
  pay_channel?: string | null
  pay_source?: string | null
  out_trade_no?: string | null
  created_at?: string
  confirmed_at?: string | null
  extend_days_applied?: number | null
  wallet_credit_cents_applied?: number | null
  points_credit_applied?: number | null
  client_note?: string | null
}

export type TenantPointsLedgerRow = {
  id: string
  delta_package_points: number
  delta_recharge_points: number
  balance_package_after: number
  balance_recharge_after: number
  reason: string
  usage_kind?: string | null
  created_at: string
}

export type TenantPayChannel = 'wechat' | 'alipay' | 'douyin'
export type TenantPayOrderKind = 'subscription' | 'recharge' | 'points_recharge'

export async function fetchTenantBillingSummary(): Promise<TenantBillingSummary> {
  const r = await billingFetch<{ summary: TenantBillingSummary }>({ action: 'billing_summary' })
  return r.summary
}

export async function fetchTenantMyOrders(): Promise<TenantPaymentOrder[]> {
  const r = await billingFetch<{ orders: TenantPaymentOrder[] }>({ action: 'my_orders' })
  return r.orders ?? []
}

export async function fetchTenantPointsLedger(): Promise<TenantPointsLedgerRow[]> {
  const r = await billingFetch<{ ledger: TenantPointsLedgerRow[] }>({ action: 'points_ledger' })
  return (r.ledger ?? []) as TenantPointsLedgerRow[]
}

export type TenantPrepayResponse = {
  orderId: string
  outTradeNo: string
  payMode: string
  codeUrl?: string
  qrCode?: string
  payPageUrl?: string
}

export async function tenantPayPrepay(input: {
  orderKind: TenantPayOrderKind
  amountCents: number
  channel: TenantPayChannel
  clientNote?: string
}): Promise<TenantPrepayResponse> {
  return billingFetch<TenantPrepayResponse>({
    action: 'pay_prepay',
    orderKind: input.orderKind,
    amountCents: input.amountCents,
    channel: input.channel,
    clientNote: input.clientNote,
  })
}

export async function tenantWalletPay(input: {
  orderKind: Extract<TenantPayOrderKind, 'subscription' | 'points_recharge'>
  amountCents: number
  clientNote?: string
}): Promise<{ orderId: string }> {
  return billingFetch<{ orderId: string }>({
    action: 'wallet_pay',
    orderKind: input.orderKind,
    amountCents: input.amountCents,
    clientNote: input.clientNote,
  })
}

export async function tenantPayPoll(
  outTradeNo: string,
): Promise<{ status: 'pending' | 'paid' | 'expired' | 'cancelled'; orderId?: string }> {
  return billingFetch({
    action: 'pay_poll',
    outTradeNo,
  })
}

export type ErpPointsSpendKind =
  | 'video'
  | 'article'
  | 'brief'
  | 'shortvideo'
  | 'cloud_edit'
  | 'digital_human'

export type ErpPointsSpendResult = {
  pointsCharged: number
  fromPackage: number
  fromRecharge: number
  packageBalance: number
  rechargeBalance: number
  balance: number
  already?: boolean
}

export async function checkErpPointsAffordable(input: {
  kind: ErpPointsSpendKind
  durationSec?: number
}): Promise<{ balance: number; packageBalance: number; rechargeBalance: number }> {
  return billingFetch({
    action: 'points_check',
    kind: input.kind,
    durationSec: input.durationSec,
  })
}

export async function spendErpPointsForUsage(input: {
  kind: ErpPointsSpendKind
  durationSec?: number
  idempotencyKey?: string
  note?: string
}): Promise<ErpPointsSpendResult> {
  return billingFetch<ErpPointsSpendResult>({
    action: 'points_spend',
    kind: input.kind,
    durationSec: input.durationSec,
    idempotencyKey: input.idempotencyKey,
    note: input.note,
  })
}
