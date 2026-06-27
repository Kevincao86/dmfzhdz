/**
 * Vercel：GET /api/meoo-supabase-payment-orders-list
 * 纯 fetch PostgREST，避免 createOpsServiceRoleClient + supabase-js 在 Serverless 上崩溃。
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

function serviceRoleHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: 'application/json',
  }
}

function mapJoinedOrders(orders: Record<string, unknown>[]): Record<string, unknown>[] {
  return orders.map((raw) => {
    const tn = raw.tenants
    let merchant_name: string | null = null
    if (tn && typeof tn === 'object') {
      if (!Array.isArray(tn)) {
        const o = tn as { name?: unknown }
        merchant_name = typeof o.name === 'string' ? o.name : null
      } else if (tn.length > 0 && tn[0] && typeof tn[0] === 'object') {
        const o = tn[0] as { name?: unknown }
        merchant_name = typeof o.name === 'string' ? o.name : null
      }
    }
    const { tenants: _drop, ...rest } = raw
    return { ...rest, merchant_name }
  })
}

async function fetchTenantNamesByIds(
  base: string,
  headers: Record<string, string>,
  tenantIds: string[],
): Promise<Map<string, string>> {
  const nameById = new Map<string, string>()
  const chunk = 80
  for (let i = 0; i < tenantIds.length; i += chunk) {
    const slice = tenantIds.slice(i, i + chunk)
    const inList = slice.map((id) => encodeURIComponent(id)).join(',')
    const tu = `${base}/rest/v1/tenants?id=in.(${inList})&select=id,name`
    const tr = await fetch(tu, { headers })
    const tt = await tr.text()
    if (!tr.ok) continue
    try {
      const trows = JSON.parse(tt || '[]') as { id?: string; name?: string }[]
      for (const t of trows) {
        if (t.id && typeof t.name === 'string') nameById.set(t.id, t.name)
      }
    } catch {
      /* noop */
    }
  }
  return nameById
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      jsonSend(res, 405, { ok: false, error: 'method_not_allowed' })
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
        hint: '订单列表需要 SUPABASE_SERVICE_ROLE_KEY（与客户列表相同）。',
      })
      return
    }

    const base = supabaseUrl.replace(/\/$/, '')
    const headers = serviceRoleHeaders(serviceRole)
    const selectJoin = encodeURIComponent('*,tenants(name)')
    const urlJoin = `${base}/rest/v1/merchant_payment_orders?select=${selectJoin}&order=created_at.desc&limit=400`

    const r = await fetch(urlJoin, { headers })
    const text = await r.text()

    if (r.ok) {
      let orders: Record<string, unknown>[]
      try {
        orders = JSON.parse(text || '[]') as Record<string, unknown>[]
      } catch {
        jsonSend(res, 502, {
          ok: false,
          error: 'payment_orders_select_failed',
          detail: text.slice(0, 400),
        })
        return
      }
      jsonSend(res, 200, { ok: true, rows: mapJoinedOrders(orders) })
      return
    }

    /* 嵌入查询失败时退回两次请求（与 listOpsPaymentOrders 语义一致） */
    const urlPlain = `${base}/rest/v1/merchant_payment_orders?select=*&order=created_at.desc&limit=400`
    const r2 = await fetch(urlPlain, { headers })
    const t2 = await r2.text()
    if (!r2.ok) {
      jsonSend(res, 502, {
        ok: false,
        error: 'payment_orders_select_failed',
        detail: [text.slice(0, 200), t2.slice(0, 200)].filter(Boolean).join(' | '),
      })
      return
    }

    let orders: Record<string, unknown>[]
    try {
      orders = JSON.parse(t2 || '[]') as Record<string, unknown>[]
    } catch {
      jsonSend(res, 502, { ok: false, error: 'payment_orders_select_failed', detail: t2.slice(0, 400) })
      return
    }

    const ids = [
      ...new Set(
        orders
          .map((o) => (typeof o.tenant_id === 'string' ? o.tenant_id.trim() : ''))
          .filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
      ),
    ]
    const nameById = await fetchTenantNamesByIds(base, headers, ids)
    const rows = orders.map((raw) => ({
      ...raw,
      merchant_name: nameById.get(String(raw.tenant_id ?? '')) ?? null,
    }))
    jsonSend(res, 200, { ok: true, rows })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'payment_orders_list_handler_failed',
      detail: msg.slice(0, 800),
    })
  }
}
