/**
 * Vercel：POST /api/meoo-supabase-payment-orders-confirm
 * 纯 fetch PostgREST，语义对齐 confirmOpsPaymentOrderAdmin（无 supabase-js）。
 *
 * 计费公式内联在此文件：切勿从 ../src 引用模块，否则 Vercel 打包 api 函数时常见 MODULE_NOT_FOUND → 500。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  buildSubscriptionPurchasePatch,
  readEntitlementDays,
} from '../tenantEntitlementCore.js'

export const config = { maxDuration: 60 }

/** 与 src/ops/paymentTierLogic.ts / web版 meooPaymentTiers 保持一致 */
const SUBSCRIPTION_TIER_CENTS = new Map<number, number>([
  [16800, 30],
  [59800, 30],
  [46800, 90],
  [168800, 90],
])

const SUBSCRIPTION_TIER_PLAN = new Map<number, string>([
  [16800, 'member'],
  [59800, 'member_plus'],
  [46800, 'member'],
  [168800, 'member_plus'],
])

function subscriptionDaysFromVerifiedCents(verifiedCents: number): number {
  if (!Number.isFinite(verifiedCents) || verifiedCents <= 0) return 0
  const hit = SUBSCRIPTION_TIER_CENTS.get(verifiedCents)
  if (hit !== undefined) return hit
  const unit = 16800 / 30
  return Math.max(1, Math.floor(verifiedCents / unit))
}

function membershipPlanFromVerifiedCents(verifiedCents: number): string | null {
  if (!Number.isFinite(verifiedCents) || verifiedCents <= 0) return null
  const hit = SUBSCRIPTION_TIER_PLAN.get(verifiedCents)
  if (hit) return hit
  if (verifiedCents >= 59800) return 'member_plus'
  if (verifiedCents >= 16800) return 'member'
  return null
}

function rechargeCreditFromVerifiedCents(verifiedCents: number): number {
  if (!Number.isFinite(verifiedCents) || verifiedCents <= 0) return 0
  return Math.floor(verifiedCents)
}

function sendOpsJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  try {
    if (res.writableEnded || res.headersSent) return
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(status).send(JSON.stringify(body))
  } catch {
    try {
      if (!res.writableEnded && !res.headersSent) res.end()
    } catch {
      /* noop */
    }
  }
}

function jsonSend(res: VercelResponse, status: number, payload: unknown): void {
  try {
    const raw = JSON.stringify(payload)
    if (!res.writableEnded && !res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.status(status).send(raw)
    }
  } catch {
    sendOpsJson(res, 500, { ok: false, error: 'json_send_failed' })
  }
}

function bodyRaw(req: VercelRequest): string {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object') return JSON.stringify(req.body)
  return '{}'
}

function readNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) return Number(v)
  return NaN
}

function serviceRoleHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: 'application/json',
  }
}

function jsonPatchHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }
}

function jsonPatchReprHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

function postJsonHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }
}

type OrderRow = Record<string, unknown>

/** PostgREST Prefer:return=representation 多为 JSON 数组；部分网关/版本可能对单行返回单个对象 */
function parseRepresentationRows(text: string): unknown[] {
  const raw = (text || '').trim()
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object') return [parsed]
  return []
}

async function finalizeOrder(
  base: string,
  serviceRole: string,
  orderId: string,
  patch: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; status: number; body: Record<string, unknown> }> {
  const url = `${base}/rest/v1/merchant_payment_orders?id=eq.${encodeURIComponent(orderId)}&status=eq.amount_verified`
  const r = await fetch(url, {
    method: 'PATCH',
    headers: jsonPatchReprHeaders(serviceRole),
    body: JSON.stringify(patch),
  })
  const text = await r.text()
  if (!r.ok) {
    return {
      ok: false,
      status: 502,
      body: { ok: false, error: 'order_finalize_failed', detail: text.slice(0, 400) },
    }
  }
  const rows = parseRepresentationRows(text)
  if (rows.length === 0) {
    return { ok: false, status: 409, body: { ok: false, error: 'order_not_ready' } }
  }
  return { ok: true }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      jsonSend(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(bodyRaw(req) || '{}') as Record<string, unknown>
    } catch {
      jsonSend(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      jsonSend(res, 400, { ok: false, error: 'invalid_id' })
      return
    }

    const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim()
    const serviceRole = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE ??
      ''
    ).trim()

    if (!supabaseUrl) {
      jsonSend(res, 503, {
        ok: false,
        error: 'supabase_admin_not_configured',
        hint: '配置 VITE_SUPABASE_URL 或 SUPABASE_URL',
      })
      return
    }
    if (!serviceRole) {
      jsonSend(res, 503, {
        ok: false,
        error: 'supabase_admin_not_configured',
        hint: '确认入账需要 SUPABASE_SERVICE_ROLE_KEY。',
      })
      return
    }

    const base = supabaseUrl.replace(/\/$/, '')
    const hGet = serviceRoleHeaders(serviceRole)

    const orderUrl = `${base}/rest/v1/merchant_payment_orders?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
    const or = await fetch(orderUrl, { headers: hGet })
    const otext = await or.text()
    if (!or.ok) {
      jsonSend(res, 502, {
        ok: false,
        error: 'order_load_failed',
        detail: otext.slice(0, 400),
      })
      return
    }

    let orows: OrderRow[]
    try {
      orows = JSON.parse(otext || '[]') as OrderRow[]
    } catch {
      jsonSend(res, 502, { ok: false, error: 'order_load_failed', detail: otext.slice(0, 200) })
      return
    }

    const order = orows[0]
    if (!order || order.status !== 'amount_verified') {
      jsonSend(res, 409, { ok: false, error: 'order_not_ready' })
      return
    }

    const vc = readNum(order.verified_amount_cents)
    if (!Number.isFinite(vc) || vc <= 0) {
      jsonSend(res, 400, { ok: false, error: 'invalid_verified_amount' })
      return
    }

    const tenantId = String(order.tenant_id ?? '').trim()
    if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
      jsonSend(res, 502, { ok: false, error: 'order_load_failed', detail: 'invalid tenant_id' })
      return
    }

    const nowIso = new Date().toISOString()
    const kind = typeof order.order_kind === 'string' ? order.order_kind : ''

    if (kind === 'subscription') {
      const days = subscriptionDaysFromVerifiedCents(vc)
      if (days <= 0) {
        jsonSend(res, 400, { ok: false, error: 'cannot_derive_days' })
        return
      }

      const tUrl = `${base}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=service_expire_at,official_days,subscription_days,ops_gift_days&limit=1`
      const tr = await fetch(tUrl, { headers: hGet })
      const ttext = await tr.text()
      if (!tr.ok) {
        jsonSend(res, 502, {
          ok: false,
          error: 'tenant_load_failed',
          detail: ttext.slice(0, 400),
        })
        return
      }
      let trows: {
        service_expire_at?: unknown
        official_days?: unknown
        subscription_days?: unknown
        ops_gift_days?: unknown
      }[]
      try {
        trows = JSON.parse(ttext || '[]') as typeof trows
      } catch {
        jsonSend(res, 502, { ok: false, error: 'tenant_load_failed', detail: ttext.slice(0, 200) })
        return
      }
      const tenant = trows[0]
      if (!tenant) {
        jsonSend(res, 502, { ok: false, error: 'tenant_load_failed', detail: 'not_found' })
        return
      }

      const sub = readEntitlementDays(
        tenant.subscription_days != null ? tenant.subscription_days : tenant.official_days,
      )
      const gift = readEntitlementDays(tenant.ops_gift_days)
      const ent = buildSubscriptionPurchasePatch({
        subscriptionDays: sub,
        opsGiftDays: gift,
        serviceExpireAt:
          tenant.service_expire_at != null ? String(tenant.service_expire_at) : null,
        purchasedDays: days,
      })

      const upTenantUrl = `${base}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}`
      const nextPlan = membershipPlanFromVerifiedCents(vc)
      const tenantPatch: Record<string, unknown> = {
        ...ent,
        updated_at: nowIso,
      }
      if (nextPlan) tenantPatch.membership_plan = nextPlan

      const upTr = await fetch(upTenantUrl, {
        method: 'PATCH',
        headers: jsonPatchHeaders(serviceRole),
        body: JSON.stringify(tenantPatch),
      })
      const upTtext = await upTr.text()
      if (!upTr.ok) {
        jsonSend(res, 502, {
          ok: false,
          error: 'tenant_update_failed',
          detail: upTtext.slice(0, 400),
        })
        return
      }

      const fin = await finalizeOrder(base, serviceRole, id, {
        status: 'confirmed',
        confirmed_at: nowIso,
        extend_days_applied: days,
        wallet_credit_cents_applied: null,
        updated_at: nowIso,
      })
      if (fin.ok === false) {
        jsonSend(res, fin.status, fin.body)
        return
      }
      jsonSend(res, 200, { ok: true })
      return
    }

    if (kind === 'recharge') {
      const credit = rechargeCreditFromVerifiedCents(vc)
      if (credit <= 0) {
        jsonSend(res, 400, { ok: false, error: 'invalid_credit' })
        return
      }

      const tUrl = `${base}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=wallet_balance_cents&limit=1`
      const tr = await fetch(tUrl, { headers: hGet })
      const ttext = await tr.text()
      if (!tr.ok) {
        jsonSend(res, 502, {
          ok: false,
          error: 'tenant_load_failed',
          detail: ttext.slice(0, 400),
        })
        return
      }
      let trows: { wallet_balance_cents?: unknown }[]
      try {
        trows = JSON.parse(ttext || '[]') as typeof trows
      } catch {
        jsonSend(res, 502, { ok: false, error: 'tenant_load_failed', detail: ttext.slice(0, 200) })
        return
      }
      const tenant = trows[0]
      if (!tenant) {
        jsonSend(res, 502, { ok: false, error: 'tenant_load_failed', detail: 'not_found' })
        return
      }
      const wb = readNum(tenant.wallet_balance_cents)
      const prevBal = Number.isFinite(wb) ? wb : 0
      const newBal = prevBal + credit

      const upTenantUrl = `${base}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}`
      const upTr = await fetch(upTenantUrl, {
        method: 'PATCH',
        headers: jsonPatchHeaders(serviceRole),
        body: JSON.stringify({
          wallet_balance_cents: newBal,
          updated_at: nowIso,
        }),
      })
      const upTtext = await upTr.text()
      if (!upTr.ok) {
        jsonSend(res, 502, {
          ok: false,
          error: 'tenant_wallet_update_failed',
          detail: upTtext.slice(0, 400),
        })
        return
      }

      const ledUrl = `${base}/rest/v1/tenant_wallet_ledger`
      const lr = await fetch(ledUrl, {
        method: 'POST',
        headers: postJsonHeaders(serviceRole),
        body: JSON.stringify({
          tenant_id: tenantId,
          delta_cents: credit,
          balance_after_cents: newBal,
          reason: '充值到账（运营确认）',
          ref_order_id: id,
        }),
      })
      const ltext = await lr.text()
      if (!lr.ok) {
        jsonSend(res, 502, {
          ok: false,
          error: 'ledger_insert_failed',
          detail: ltext.slice(0, 400),
        })
        return
      }

      const fin = await finalizeOrder(base, serviceRole, id, {
        status: 'confirmed',
        confirmed_at: nowIso,
        extend_days_applied: null,
        wallet_credit_cents_applied: credit,
        updated_at: nowIso,
      })
      if (fin.ok === false) {
        jsonSend(res, fin.status, fin.body)
        return
      }
      jsonSend(res, 200, { ok: true })
      return
    }

    if (kind === 'refund') {
      const debit = vc

      const tUrl = `${base}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=wallet_balance_cents&limit=1`
      const tr = await fetch(tUrl, { headers: hGet })
      const ttext = await tr.text()
      if (!tr.ok) {
        jsonSend(res, 502, {
          ok: false,
          error: 'tenant_load_failed',
          detail: ttext.slice(0, 400),
        })
        return
      }
      let trows: { wallet_balance_cents?: unknown }[]
      try {
        trows = JSON.parse(ttext || '[]') as typeof trows
      } catch {
        jsonSend(res, 502, { ok: false, error: 'tenant_load_failed', detail: ttext.slice(0, 200) })
        return
      }
      const tenant = trows[0]
      if (!tenant) {
        jsonSend(res, 502, { ok: false, error: 'tenant_load_failed', detail: 'not_found' })
        return
      }
      const wb = readNum(tenant.wallet_balance_cents)
      const prevBal = Number.isFinite(wb) ? wb : 0
      if (debit > prevBal) {
        jsonSend(res, 400, { ok: false, error: 'insufficient_wallet_for_refund' })
        return
      }
      const newBal = prevBal - debit

      const upTenantUrl = `${base}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}`
      const upTr = await fetch(upTenantUrl, {
        method: 'PATCH',
        headers: jsonPatchHeaders(serviceRole),
        body: JSON.stringify({
          wallet_balance_cents: newBal,
          updated_at: nowIso,
        }),
      })
      const upTtext = await upTr.text()
      if (!upTr.ok) {
        jsonSend(res, 502, {
          ok: false,
          error: 'tenant_wallet_update_failed',
          detail: upTtext.slice(0, 400),
        })
        return
      }

      const ledUrl = `${base}/rest/v1/tenant_wallet_ledger`
      const lr = await fetch(ledUrl, {
        method: 'POST',
        headers: postJsonHeaders(serviceRole),
        body: JSON.stringify({
          tenant_id: tenantId,
          delta_cents: -debit,
          balance_after_cents: newBal,
          reason: '退款扣减（运营确认）',
          ref_order_id: id,
        }),
      })
      const ltext = await lr.text()
      if (!lr.ok) {
        jsonSend(res, 502, {
          ok: false,
          error: 'ledger_insert_failed',
          detail: ltext.slice(0, 400),
        })
        return
      }

      const fin = await finalizeOrder(base, serviceRole, id, {
        status: 'confirmed',
        confirmed_at: nowIso,
        extend_days_applied: null,
        wallet_credit_cents_applied: null,
        updated_at: nowIso,
      })
      if (fin.ok === false) {
        jsonSend(res, fin.status, fin.body)
        return
      }
      jsonSend(res, 200, { ok: true })
      return
    }

    jsonSend(res, 400, { ok: false, error: 'unknown_order_kind' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'payment_order_confirm_handler_failed',
      detail: msg.slice(0, 800),
    })
  }
}
