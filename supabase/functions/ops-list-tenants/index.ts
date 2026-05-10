/**
 * 运营管控台列出租户（需 x-meoo-provision-secret，与 provision-tenant 一致）。
 * 不依赖数据库 RPC，便于未执行最新 migration 的环境。
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-meoo-provision-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

type TenantRow = {
  id: string
  name: string
  account_status: string
  trial_days: number
  official_days: number
  created_at: string
  updated_at: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' })
  }

  const expected = Deno.env.get('MEOO_PROVISION_SECRET')
  const sent = req.headers.get('x-meoo-provision-secret')
  if (!expected || sent !== expected) {
    return json(401, { ok: false, error: 'unauthorized' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: 'server_misconfigured' })
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: trows, error: e1 } = await admin
    .from('tenants')
    .select('id, name, account_status, trial_days, official_days, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (e1) {
    return json(500, { ok: false, error: 'tenants_select_failed', detail: e1.message })
  }

  const { data: mrows, error: e2 } = await admin
    .from('tenant_members')
    .select('tenant_id, user_id, role')
    .eq('role', 'owner')

  if (e2) {
    return json(500, { ok: false, error: 'members_select_failed', detail: e2.message })
  }

  const ownerByTenant = new Map<string, string>()
  for (const m of mrows ?? []) {
    const tid = typeof m.tenant_id === 'string' ? m.tenant_id : ''
    const uid = typeof m.user_id === 'string' ? m.user_id : ''
    if (tid && uid && !ownerByTenant.has(tid)) ownerByTenant.set(tid, uid)
  }

  const out: Record<string, unknown>[] = []
  for (const t of (trows ?? []) as TenantRow[]) {
    const uid = ownerByTenant.get(t.id)
    let login_name = ''
    let user_email = ''
    if (uid) {
      const { data: uwrap, error: ue } = await admin.auth.admin.getUserById(uid)
      if (!ue && uwrap?.user) {
        const u = uwrap.user
        const meta = u.user_metadata as { login_name?: string } | undefined
        login_name =
          (typeof meta?.login_name === 'string' && meta.login_name.trim()) ||
          (u.email?.split('@')[0] ?? '')
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
      created_at: t.created_at,
      updated_at: t.updated_at,
      owner_user_id: uid ?? null,
    })
  }

  return json(200, { ok: true, rows: out })
})
