/**
 * Vercel：POST /api/meoo-supabase-payment-orders-verify
 * 纯 fetch PostgREST，语义对齐 verifyOpsPaymentOrderAdmin（无 supabase-js）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 60 }

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

function serviceRoleHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: 'application/json',
  }
}

function patchHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

type OrderRow = {
  id?: string
  status?: string
  order_kind?: string
  amount_cents?: unknown
  tenant_id?: string
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
    const verifiedRaw =
      typeof body.verified_amount_cents === 'number' && Number.isFinite(body.verified_amount_cents)
        ? Math.floor(body.verified_amount_cents)
        : NaN

    if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !Number.isFinite(verifiedRaw) || verifiedRaw <= 0) {
      jsonSend(res, 400, { ok: false, error: 'invalid_payload' })
      return
    }
    const verified = verifiedRaw

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
        hint: '核对金额需要 SUPABASE_SERVICE_ROLE_KEY。',
      })
      return
    }

    const base = supabaseUrl.replace(/\/$/, '')
    const hGet = serviceRoleHeaders(serviceRole)
    const orderUrl = `${base}/rest/v1/merchant_payment_orders?id=eq.${encodeURIComponent(id)}&select=id,status,order_kind,amount_cents,tenant_id&limit=1`

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

    const ord = orows[0]
    if (!ord || ord.status !== 'pending') {
      jsonSend(res, 409, { ok: false, error: 'not_pending_or_missing' })
      return
    }

    const kind = typeof ord.order_kind === 'string' ? ord.order_kind : ''
    if (kind === 'refund') {
      const declared = Number(ord.amount_cents)
      if (!Number.isFinite(declared) || declared <= 0) {
        jsonSend(res, 400, { ok: false, error: 'invalid_order_amount' })
        return
      }
      if (verified > declared) {
        jsonSend(res, 400, { ok: false, error: 'refund_verify_exceeds_declared' })
        return
      }
      const tid = typeof ord.tenant_id === 'string' ? ord.tenant_id.trim() : ''
      if (!tid) {
        jsonSend(res, 502, { ok: false, error: 'tenant_load_failed', detail: 'missing tenant_id' })
        return
      }
      const tUrl = `${base}/rest/v1/tenants?id=eq.${encodeURIComponent(tid)}&select=wallet_balance_cents&limit=1`
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
      const wb = tenant.wallet_balance_cents
      const bal =
        typeof wb === 'number' && Number.isFinite(wb)
          ? wb
          : typeof wb === 'string'
            ? Number(wb)
            : NaN
      const balSafe = Number.isFinite(bal) ? bal : 0
      if (verified > balSafe) {
        jsonSend(res, 400, { ok: false, error: 'refund_verify_exceeds_wallet' })
        return
      }
    }

    const nowIso = new Date().toISOString()
    const patchUrl = `${base}/rest/v1/merchant_payment_orders?id=eq.${encodeURIComponent(id)}&status=eq.pending`
    const patchBody = JSON.stringify({
      verified_amount_cents: verified,
      verified_at: nowIso,
      status: 'amount_verified',
      updated_at: nowIso,
    })

    const ur = await fetch(patchUrl, {
      method: 'PATCH',
      headers: patchHeaders(serviceRole),
      body: patchBody,
    })
    const utext = await ur.text()
    if (!ur.ok) {
      jsonSend(res, 502, {
        ok: false,
        error: 'verify_failed',
        detail: utext.slice(0, 400),
      })
      return
    }

    let updated: unknown[]
    try {
      updated = JSON.parse(utext || '[]') as unknown[]
    } catch {
      jsonSend(res, 502, { ok: false, error: 'verify_failed', detail: utext.slice(0, 200) })
      return
    }

    if (!Array.isArray(updated) || updated.length === 0) {
      jsonSend(res, 409, { ok: false, error: 'not_pending_or_missing' })
      return
    }

    jsonSend(res, 200, { ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'payment_order_verify_handler_failed',
      detail: msg.slice(0, 800),
    })
  }
}
