/**
 * Vercel Serverless（Node）：运营台列出 public.tenants + owner 登录信息。
 * 本地 dev 仍由 vite-plugins/opsSupabaseAdminPlugin 处理同源 GET。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

type TenantRow = {
  id: string
  name: string
  account_status: string
  trial_days: number
  official_days: number
  wallet_balance_cents: number
  service_expire_at: string | null
  created_at: string
  updated_at: string
}

async function listTenantsWithAdminClient(
  supabaseUrl: string,
  serviceKey: string,
): Promise<{ ok: true; rows: Record<string, unknown>[] } | { ok: false; message: string; detail?: string }> {
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const fullTenantSelect =
    'id, name, account_status, trial_days, official_days, wallet_balance_cents, service_expire_at, created_at, updated_at'

  let trows: TenantRow[] | null = null
  const fullRes = await admin.from('tenants').select(fullTenantSelect).order('created_at', { ascending: false })

  if (!fullRes.error) {
    trows = (fullRes.data ?? []) as TenantRow[]
  } else if (
    /wallet_balance_cents|service_expire_at|does not exist|Could not find|schema cache/i.test(fullRes.error.message)
  ) {
    const legacy = await admin
      .from('tenants')
      .select('id, name, account_status, trial_days, official_days, created_at, updated_at')
      .order('created_at', { ascending: false })
    if (legacy.error) {
      return { ok: false, message: 'tenants_select_failed', detail: legacy.error.message }
    }
    trows = (legacy.data ?? []).map((row) => ({
      ...(row as Omit<TenantRow, 'wallet_balance_cents' | 'service_expire_at'>),
      wallet_balance_cents: 0,
      service_expire_at: null,
    }))
  } else {
    return { ok: false, message: 'tenants_select_failed', detail: fullRes.error.message }
  }

  const { data: mrows, error: e2 } = await admin.from('tenant_members').select('tenant_id, user_id, role').eq('role', 'owner')

  if (e2) {
    return { ok: false, message: 'members_select_failed', detail: e2.message }
  }

  const ownerByTenant = new Map<string, string>()
  for (const m of mrows ?? []) {
    const tid = typeof m.tenant_id === 'string' ? m.tenant_id : ''
    const uid = typeof m.user_id === 'string' ? m.user_id : ''
    if (tid && uid && !ownerByTenant.has(tid)) ownerByTenant.set(tid, uid)
  }

  const out: Record<string, unknown>[] = []
  for (const t of trows ?? []) {
    const uid = ownerByTenant.get(t.id)
    let login_name = ''
    let user_email = ''
    if (uid) {
      const { data: uwrap, error: ue } = await admin.auth.admin.getUserById(uid)
      if (!ue && uwrap?.user) {
        const u = uwrap.user
        const meta = u.user_metadata as { login_name?: string } | undefined
        login_name =
          (typeof meta?.login_name === 'string' && meta.login_name.trim()) || (u.email?.split('@')[0] ?? '')
        user_email = u.email ?? ''
      }
    }
    out.push({
      tenant_id: t.id,
      merchant_name: t.name,
      login_name: login_name || '—',
      user_email,
      account_status: t.account_status,
      trial_days: t.trial_days,
      official_days: t.official_days,
      wallet_balance_cents: typeof t.wallet_balance_cents === 'number' ? t.wallet_balance_cents : 0,
      service_expire_at: t.service_expire_at ?? null,
      created_at: t.created_at,
      updated_at: t.updated_at,
      owner_user_id: uid ?? null,
    })
  }

  return { ok: true, rows: out }
}

async function edgePost(
  supabaseUrl: string,
  anon: string,
  secret: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/ops-list-tenants`
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
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (req.method !== 'GET') {
    res.status(405).send(JSON.stringify({ ok: false, error: 'method_not_allowed' }))
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
    res.status(503).send(
      JSON.stringify({
        ok: false,
        error: 'supabase_admin_not_configured',
        hint: '配置 VITE_SUPABASE_URL 或 SUPABASE_URL（Production 环境）。',
      }),
    )
    return
  }

  if (serviceRole) {
    const lr = await listTenantsWithAdminClient(supabaseUrl, serviceRole)
    if (lr.ok) {
      res.status(200).send(JSON.stringify({ ok: true, rows: lr.rows }))
      return
    }
    if (anon && secret) {
      const er = await edgePost(supabaseUrl, anon, secret, {})
      if (er.ok && er.data.ok !== false) {
        const rows = Array.isArray(er.data.rows) ? er.data.rows : []
        res.status(200).send(JSON.stringify({ ok: true, rows }))
        return
      }
      const detail = [lr.detail, JSON.stringify(er.data).slice(0, 400)].filter(Boolean).join(' | ')
      res.status(er.status >= 400 ? er.status : 502).send(
        JSON.stringify({
          ok: false,
          error: 'list_failed',
          detail,
          hint:
            'Service Role 列租户失败，且 Edge ops-list-tenants 无有效数据。请核对 SUPABASE_SERVICE_ROLE_KEY、数据库权限，或部署 ops-list-tenants。',
        }),
      )
      return
    }
    res.status(502).send(
      JSON.stringify({
        ok: false,
        error: lr.message,
        detail: lr.detail,
        hint: '请核对 SUPABASE_SERVICE_ROLE_KEY 与数据库 tenants / tenant_members 表。',
      }),
    )
    return
  }

  if (anon && secret) {
    const er = await edgePost(supabaseUrl, anon, secret, {})
    if (!er.ok || er.data.ok === false) {
      const detail = JSON.stringify(er.data).slice(0, 800)
      res.status(er.status >= 400 ? er.status : 502).send(
        JSON.stringify({
          ok: false,
          error: 'edge_list_failed',
          detail,
          hint: '未配置 SUPABASE_SERVICE_ROLE_KEY 时依赖 Edge ops-list-tenants；请部署该函数并配置 MEOO_PROVISION_SECRET。',
        }),
      )
      return
    }
    const rows = Array.isArray(er.data.rows) ? er.data.rows : []
    res.status(200).send(JSON.stringify({ ok: true, rows }))
    return
  }

  res.status(503).send(
    JSON.stringify({
      ok: false,
      error: 'supabase_admin_not_configured',
      hint:
        '请配置 SUPABASE_SERVICE_ROLE_KEY（推荐），或 SUPABASE_ANON_KEY + MEOO_PROVISION_SECRET 并部署 ops-list-tenants。',
    }),
  )
}
