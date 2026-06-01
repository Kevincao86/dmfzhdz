/**
 * 运营台 · 单租户使用看板 + 客服会话摘要（Service Role）
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeTenantUsageMetrics } from '../src/ops/opsTenantUsageStats.js'

export type OpsTenantSupportSessionRow = {
  sessionId: string
  lastText: string
  lastTs: number
  messageCount: number
  enterpriseName?: string
  customerId?: string
}

export type OpsTenantInsightsResult =
  | {
      ok: true
      usage: ReturnType<typeof computeTenantUsageMetrics>
      supportSessions: OpsTenantSupportSessionRow[]
    }
  | { ok: false; status: number; body: Record<string, unknown> }

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function isErpSupportSession(sessionId: string): boolean {
  const sid = sessionId.trim()
  if (!sid) return false
  return !sid.startsWith('lq-mp-') && !sid.startsWith('mp-')
}

function sessionMatchesTenant(
  row: { customer_id?: string | null; enterprise_name?: string | null },
  loginName: string,
  merchantName: string,
): boolean {
  const login = norm(loginName)
  const merchant = norm(merchantName)
  const cid = norm(String(row.customer_id ?? ''))
  const ent = norm(String(row.enterprise_name ?? ''))
  if (login && cid && cid === login) return true
  if (merchant && ent && (ent === merchant || ent.includes(merchant) || merchant.includes(ent))) {
    return true
  }
  return false
}

export async function opsTenantInsightsAdmin(
  admin: SupabaseClient,
  tenantId: string,
  loginName: string,
  merchantName: string,
  authHeaders: Record<string, string>,
  supabaseUrl: string,
): Promise<OpsTenantInsightsResult> {
  const tid = tenantId.trim()
  if (!tid || !/^[0-9a-f-]{36}$/i.test(tid)) {
    return { ok: false, status: 400, body: { ok: false, error: 'invalid_tenant_id' } }
  }

  const { data: tenant, error: te } = await admin
    .from('tenants')
    .select('created_at, updated_at')
    .eq('id', tid)
    .maybeSingle()

  if (te || !tenant) {
    return {
      ok: false,
      status: 502,
      body: { ok: false, error: 'tenant_load_failed', detail: te?.message ?? 'not_found' },
    }
  }

  const extraActivityAt: Array<string | number> = []

  const { data: ledgerRows } = await admin
    .from('tenant_wallet_ledger')
    .select('created_at')
    .eq('tenant_id', tid)
    .order('created_at', { ascending: false })
    .limit(100)

  for (const row of ledgerRows ?? []) {
    if (typeof row.created_at === 'string') extraActivityAt.push(row.created_at)
  }

  const { data: mem } = await admin
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', tid)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle()

  const ownerId = typeof mem?.user_id === 'string' ? mem.user_id : ''
  if (ownerId) {
    try {
      const base = supabaseUrl.replace(/\/$/, '')
      const ur = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(ownerId)}`, {
        headers: authHeaders,
      })
      if (ur.ok) {
        const wrap = (await ur.json()) as Record<string, unknown>
        const u = (wrap.user ?? wrap) as Record<string, unknown>
        const lastSignIn = typeof u.last_sign_in_at === 'string' ? u.last_sign_in_at : ''
        if (lastSignIn) extraActivityAt.push(lastSignIn)
      }
    } catch {
      /* ignore auth fetch */
    }
  }

  const base = supabaseUrl.replace(/\/$/, '')
  const supportSessions: OpsTenantSupportSessionRow[] = []
  const sessionMap = new Map<string, OpsTenantSupportSessionRow>()

  try {
    const q = new URLSearchParams({
      select: 'session_id,customer_id,enterprise_name,from_role,text,ts',
      order: 'ts.desc',
      limit: '500',
    })
    const sr = await fetch(`${base}/rest/v1/support_relay_messages?${q}`, { headers: authHeaders })
    if (sr.ok) {
      const rows = (await sr.json()) as Array<{
        session_id?: string
        customer_id?: string | null
        enterprise_name?: string | null
        text?: string
        ts?: number
      }>
      for (const row of rows ?? []) {
        const sessionId = typeof row.session_id === 'string' ? row.session_id.trim() : ''
        if (!sessionId || !isErpSupportSession(sessionId)) continue
        if (!sessionMatchesTenant(row, loginName, merchantName)) continue
        const ts = typeof row.ts === 'number' ? row.ts : 0
        const text = typeof row.text === 'string' ? row.text : ''
        const existing = sessionMap.get(sessionId)
        if (!existing) {
          sessionMap.set(sessionId, {
            sessionId,
            lastText: text,
            lastTs: ts,
            messageCount: 1,
            customerId: row.customer_id ?? undefined,
            enterpriseName: row.enterprise_name ?? undefined,
          })
        } else {
          existing.messageCount += 1
          if (ts > existing.lastTs) {
            existing.lastTs = ts
            existing.lastText = text
          }
        }
        if (ts > 0) extraActivityAt.push(ts)
      }
    }
  } catch {
    /* support table may be missing */
  }

  supportSessions.push(
    ...[...sessionMap.values()].sort((a, b) => b.lastTs - a.lastTs),
  )

  const usage = computeTenantUsageMetrics({
    createdAt: String(tenant.created_at ?? ''),
    updatedAt: String(tenant.updated_at ?? tenant.created_at ?? ''),
    extraActivityAt,
  })

  return { ok: true, usage, supportSessions }
}
