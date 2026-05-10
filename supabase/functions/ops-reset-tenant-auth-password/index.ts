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

const DEFAULT_PASSWORD = '123456'

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

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return json(400, { ok: false, error: 'invalid_json' })
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return json(400, { ok: false, error: 'invalid_id' })
  }

  const rawPw = typeof body.password === 'string' ? body.password : ''
  const password = rawPw.length >= 6 ? rawPw : DEFAULT_PASSWORD

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: members, error: me } = await admin
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', id)
    .eq('role', 'owner')
    .limit(1)

  if (me) {
    return json(500, { ok: false, error: 'members_lookup_failed', detail: me.message })
  }
  const uid = members?.[0]?.user_id
  if (!uid || typeof uid !== 'string') {
    return json(404, { ok: false, error: 'owner_not_found' })
  }

  const { error: ue } = await admin.auth.admin.updateUserById(uid, { password })
  if (ue) {
    return json(500, { ok: false, error: 'auth_update_failed', detail: ue.message })
  }

  return json(200, { ok: true })
})
