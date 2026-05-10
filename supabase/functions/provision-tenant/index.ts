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

function loginNameToEmail(loginName: string, domain: string): string {
  const slug = loginName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${slug || 'user'}@${domain}`
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

  const emailDomain = Deno.env.get('TENANT_EMAIL_DOMAIN') ?? 'users.meoo.test'

  let payload: {
    loginName?: string
    password?: string
    merchantName?: string
    trialDays?: number
    officialDays?: number
  }
  try {
    payload = (await req.json()) as typeof payload
  } catch {
    return json(400, { ok: false, error: 'invalid_json' })
  }

  const loginName = (payload.loginName ?? '').trim()
  const password = payload.password ?? ''
  const merchantName = (payload.merchantName ?? '').trim()
  const trialDays = Math.max(0, Math.min(3650, Number(payload.trialDays) || 0))
  const officialDays = Math.max(0, Math.min(36500, Number(payload.officialDays) || 0))

  if (loginName.length < 2 || password.length < 6 || merchantName.length < 1) {
    return json(400, { ok: false, error: 'invalid_fields' })
  }

  const email = loginNameToEmail(loginName, emailDomain)
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      login_name: loginName,
      merchant_name: merchantName,
    },
  })

  if (createErr || !created.user) {
    const msg = createErr?.message?.toLowerCase() ?? ''
    if (msg.includes('already been registered') || msg.includes('already exists')) {
      return json(409, { ok: false, error: 'login_exists' })
    }
    return json(400, { ok: false, error: 'auth_create_failed', detail: createErr?.message })
  }

  const userId = created.user.id

  const { data: tenantRow, error: tenantErr } = await admin
    .from('tenants')
    .insert({
      name: merchantName,
      trial_days: trialDays,
      official_days: officialDays,
      account_status: 'normal',
    })
    .select('id')
    .single()

  if (tenantErr || !tenantRow) {
    await admin.auth.admin.deleteUser(userId)
    return json(500, { ok: false, error: 'tenant_insert_failed', detail: tenantErr?.message })
  }

  const { error: memErr } = await admin.from('tenant_members').insert({
    tenant_id: tenantRow.id,
    user_id: userId,
    role: 'owner',
  })

  if (memErr) {
    await admin.from('tenants').delete().eq('id', tenantRow.id)
    await admin.auth.admin.deleteUser(userId)
    return json(500, { ok: false, error: 'member_insert_failed', detail: memErr.message })
  }

  return json(200, {
    ok: true,
    tenantId: tenantRow.id,
    userId,
    email,
  })
})
