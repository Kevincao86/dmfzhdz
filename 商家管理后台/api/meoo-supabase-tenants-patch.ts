/**
 * Vercel：POST /api/meoo-supabase-tenants-patch
 * 使用 fetch 调 PostgREST，避免 @supabase/supabase-js 在 Vercel 上崩溃（与 meoo-supabase-tenants-list 一致）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { buildOpsGiftDaysPatch, readEntitlementDays } from './tenantEntitlementCore.js'

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
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }
}

function buildPatchBody(body: Record<string, unknown>): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, error: 'invalid_id' }
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (typeof body.merchantName === 'string' && body.merchantName.trim()) {
    patch.name = body.merchantName.trim()
  }
  if (body.accountStatus === 'normal' || body.accountStatus === 'disabled' || body.accountStatus === 'frozen') {
    patch.account_status = body.accountStatus
  }
  if (typeof body.trialDays === 'number' && Number.isFinite(body.trialDays)) {
    patch.trial_days = Math.max(0, Math.min(3650, Math.floor(body.trialDays)))
  }
  if (body.membershipPlan === 'free' || body.membershipPlan === 'member' || body.membershipPlan === 'member_plus') {
    patch.membership_plan = body.membershipPlan
  }

  return { ok: true, patch }
}

async function mergeOpsGiftEntitlementPatch(
  base: string,
  id: string,
  headers: Record<string, string>,
  opsGiftDays: number,
  patch: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const url = `${base}/rest/v1/tenants?id=eq.${encodeURIComponent(id)}&select=service_expire_at,subscription_days,ops_gift_days,official_days&limit=1`
  const tr = await fetch(url, {
    headers: {
      apikey: headers.apikey,
      Authorization: headers.Authorization,
      Accept: 'application/json',
    },
  })
  const text = await tr.text()
  if (!tr.ok) return { ok: false, detail: text.slice(0, 400) }
  let rows: {
    service_expire_at?: unknown
    subscription_days?: unknown
    ops_gift_days?: unknown
    official_days?: unknown
  }[]
  try {
    rows = JSON.parse(text || '[]') as typeof rows
  } catch {
    return { ok: false, detail: text.slice(0, 200) }
  }
  const tenant = rows[0]
  if (!tenant) return { ok: false, detail: 'tenant_not_found' }
  const sub = readEntitlementDays(
    tenant.subscription_days != null ? tenant.subscription_days : tenant.official_days,
  )
  const oldGift = readEntitlementDays(tenant.ops_gift_days)
  const ent = buildOpsGiftDaysPatch({
    subscriptionDays: sub,
    oldOpsGiftDays: oldGift,
    newOpsGiftDays: opsGiftDays,
    serviceExpireAt:
      tenant.service_expire_at != null ? String(tenant.service_expire_at) : null,
  })
  Object.assign(patch, ent)
  return { ok: true }
}

async function edgePostPatch(
  supabaseUrl: string,
  anon: string,
  secret: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/ops-patch-tenant`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anon}`,
      apikey: anon,
      'Content-Type': 'application/json',
      'x-meoo-provision-secret': secret,
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: res.ok, status: res.status, data }
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

    const built = buildPatchBody(body)
    if (built.ok === false) {
      jsonSend(res, 400, { ok: false, error: built.error })
      return
    }

    const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim()
    const serviceRole = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE ??
      ''
    ).trim()
    const anon = (process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
    const secret = (process.env.MEOO_PROVISION_SECRET ?? '').trim()

    if (!supabaseUrl) {
      jsonSend(res, 503, {
        ok: false,
        error: 'supabase_admin_not_configured',
        hint: '配置 VITE_SUPABASE_URL 或 SUPABASE_URL',
      })
      return
    }

    const id = String(body.id ?? '').trim()
    const base = supabaseUrl.replace(/\/$/, '')

    if (typeof body.opsGiftDays === 'number' && Number.isFinite(body.opsGiftDays)) {
      if (serviceRole) {
        const merged = await mergeOpsGiftEntitlementPatch(
          base,
          id,
          serviceRoleHeaders(serviceRole),
          Math.max(0, Math.min(36500, Math.floor(body.opsGiftDays))),
          built.patch,
        )
        if (!merged.ok) {
          jsonSend(res, 502, { ok: false, error: 'tenant_load_failed', detail: merged.detail })
          return
        }
      }
    } else if (typeof body.officialDays === 'number' && Number.isFinite(body.officialDays)) {
      built.patch.official_days = Math.max(0, Math.min(36500, Math.floor(body.officialDays)))
    }

    if (serviceRole) {
      const url = `${base}/rest/v1/tenants?id=eq.${encodeURIComponent(id)}`
      const r = await fetch(url, {
        method: 'PATCH',
        headers: serviceRoleHeaders(serviceRole),
        body: JSON.stringify(built.patch),
      })
      if (!r.ok) {
        const t = await r.text()
        jsonSend(res, 502, { ok: false, error: 'patch_failed', detail: t.slice(0, 400) })
        return
      }
      jsonSend(res, 200, { ok: true })
      return
    }

    if (anon && secret) {
      const er = await edgePostPatch(supabaseUrl, anon, secret, body)
      if (!er.ok || er.data.ok === false) {
        jsonSend(res, er.status >= 400 ? er.status : 502, {
          ok: false,
          error: 'edge_patch_failed',
          detail: JSON.stringify(er.data).slice(0, 600),
        })
        return
      }
      jsonSend(res, 200, { ok: true })
      return
    }

    jsonSend(res, 503, {
      ok: false,
      error: 'supabase_admin_not_configured',
      hint: '配置 SUPABASE_SERVICE_ROLE_KEY，或 ANON + MEOO_PROVISION_SECRET 并部署 ops-patch-tenant',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'tenant_patch_handler_failed',
      detail: msg.slice(0, 800),
    })
  }
}
