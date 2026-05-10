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

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (typeof body.merchantName === 'string' && body.merchantName.trim()) patch.name = body.merchantName.trim()
  if (body.accountStatus === 'normal' || body.accountStatus === 'disabled' || body.accountStatus === 'frozen') {
    patch.account_status = body.accountStatus
  }
  if (typeof body.trialDays === 'number' && Number.isFinite(body.trialDays)) {
    patch.trial_days = Math.max(0, Math.min(3650, Math.floor(body.trialDays)))
  }
  if (typeof body.officialDays === 'number' && Number.isFinite(body.officialDays)) {
    patch.official_days = Math.max(0, Math.min(36500, Math.floor(body.officialDays)))
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await admin.from('tenants').update(patch).eq('id', id)
  if (error) {
    return json(500, { ok: false, error: 'patch_failed', detail: error.message })
  }
  return json(200, { ok: true })
})
