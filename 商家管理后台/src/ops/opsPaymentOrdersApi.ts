import { fetchOpsErpApi } from '../lib/opsErpApiBase.js'
import { requireOpsModuleEdit } from './opsStaffAuth'

export type OpsPaymentOrderRow = {
  id: string
  tenant_id: string
  created_by_user_id: string | null
  order_kind: 'subscription' | 'recharge' | 'refund'
  amount_cents: number
  currency: string
  pay_channel: string | null
  client_note: string | null
  status: 'pending' | 'amount_verified' | 'confirmed' | 'cancelled'
  verified_amount_cents: number | null
  verified_at: string | null
  confirmed_at: string | null
  extend_days_applied: number | null
  wallet_credit_cents_applied: number | null
  created_at: string
  updated_at: string
  merchant_name?: string | null
  tenant_login_name?: string | null
}

export async function fetchOpsPaymentOrders(): Promise<
  { ok: true; rows: OpsPaymentOrderRow[] } | { ok: false; error: string; hint?: string }
> {
  /** 扁平路径，避免 ops-supabase/payment-orders-list + supabase-js 在 Vercel 上崩溃 */
  const res = await fetchOpsErpApi('/api/meoo-supabase-payment-orders-list')
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    rows?: OpsPaymentOrderRow[]
    error?: string
    hint?: string
  }
  if (!res.ok || !j.ok) {
    return { ok: false, error: j.error ?? `http_${res.status}`, hint: j.hint }
  }
  return { ok: true, rows: Array.isArray(j.rows) ? j.rows : [] }
}

export async function verifyOpsPaymentOrder(body: {
  id: string
  verified_amount_cents: number
}): Promise<{ ok: boolean; error?: string }> {
  const denied = requireOpsModuleEdit('payment_orders')
  if (denied) return { ok: false, error: denied }
  const res = await fetchOpsErpApi('/api/meoo-supabase-payment-orders-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!res.ok || !j.ok) return { ok: false, error: j.error ?? `http_${res.status}` }
  return { ok: true }
}

export async function confirmOpsPaymentOrder(body: { id: string }): Promise<{ ok: boolean; error?: string }> {
  const denied = requireOpsModuleEdit('payment_orders')
  if (denied) return { ok: false, error: denied }
  const res = await fetchOpsErpApi('/api/meoo-supabase-payment-orders-confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; detail?: string }
  if (!res.ok || !j.ok) {
    const code = (typeof j.error === 'string' && j.error) || `http_${res.status}`
    const detail = typeof j.detail === 'string' && j.detail.trim() ? j.detail.trim().slice(0, 500) : ''
    return { ok: false, error: detail ? `${code}\n${detail}` : code }
  }
  return { ok: true }
}

export async function deleteOpsPaymentOrder(body: { id: string }): Promise<{ ok: boolean; error?: string; hint?: string }> {
  const denied = requireOpsModuleEdit('payment_orders')
  if (denied) return { ok: false, error: denied }
  const res = await fetch('/api/ops-supabase/payment-orders/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; hint?: string }
  if (!res.ok || !j.ok) return { ok: false, error: j.error ?? `http_${res.status}`, hint: j.hint }
  return { ok: true }
}
