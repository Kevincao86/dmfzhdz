/**
 * Vercel Edge：手动创建租户。
 *
 * 优先路径（推荐上线）：配置 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY，在本路由内直接开通 Auth 用户与 tenants / tenant_members，无需部署 Supabase Edge Function。
 * 备选路径：仅配置 ANON_KEY + MEOO_PROVISION_SECRET 时，转发到 Supabase Edge Function provision-tenant。
 *
 * 本地开发仍由 vite-plugins/provisionTenantProxy 处理同源 POST。
 */
export const config = { runtime: 'edge' }

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
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

type CreateUserJson = {
  id?: string
  user?: { id?: string }
  msg?: string
  message?: string
  error_description?: string
}

async function provisionWithServiceRole(
  supabaseUrl: string,
  serviceRole: string,
  rawBody: string,
  tenantEmailDomain: string,
): Promise<Response> {
  let payload: {
    loginName?: string
    password?: string
    merchantName?: string
    trialDays?: number
    officialDays?: number
  }
  try {
    payload = JSON.parse(rawBody) as typeof payload
  } catch {
    return jsonResponse(400, { ok: false, error: 'invalid_json' })
  }

  const loginName = (payload.loginName ?? '').trim()
  const password = payload.password ?? ''
  const merchantName = (payload.merchantName ?? '').trim()
  const trialDays = Math.max(0, Math.min(3650, Number(payload.trialDays) || 0))
  const officialDays = Math.max(0, Math.min(36500, Number(payload.officialDays) || 0))

  if (loginName.length < 2 || password.length < 6 || merchantName.length < 1) {
    return jsonResponse(400, { ok: false, error: 'invalid_fields' })
  }

  const base = supabaseUrl.replace(/\/$/, '')
  const email = loginNameToEmail(loginName, tenantEmailDomain)
  const headers: Record<string, string> = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    'Content-Type': 'application/json',
  }

  const createRes = await fetch(`${base}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        login_name: loginName,
        merchant_name: merchantName,
      },
    }),
  })

  const createText = await createRes.text()
  let createJson: CreateUserJson = {}
  try {
    createJson = JSON.parse(createText) as CreateUserJson
  } catch {
    /* ignore */
  }

  const userId = typeof createJson.id === 'string' ? createJson.id : createJson.user?.id

  if (!createRes.ok || !userId) {
    const detailRaw =
      createJson.msg ?? createJson.message ?? createJson.error_description ?? createText
    const msg = String(detailRaw).toLowerCase()
    if (msg.includes('already been registered') || msg.includes('already exists')) {
      return jsonResponse(409, { ok: false, error: 'login_exists' })
    }
    return jsonResponse(400, {
      ok: false,
      error: 'auth_create_failed',
      detail: String(detailRaw).slice(0, 400),
    })
  }

  const tenantRes = await fetch(`${base}/rest/v1/tenants`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      name: merchantName,
      trial_days: trialDays,
      official_days: officialDays,
      account_status: 'normal',
    }),
  })

  const tenantText = await tenantRes.text()
  let tenantRows: { id: string }[] = []
  try {
    tenantRows = JSON.parse(tenantText) as { id: string }[]
  } catch {
    tenantRows = []
  }

  const tenantId = tenantRows[0]?.id
  if (!tenantRes.ok || !tenantId) {
    await fetch(`${base}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers })
    return jsonResponse(500, {
      ok: false,
      error: 'tenant_insert_failed',
      detail: tenantText.slice(0, 400),
    })
  }

  const memRes = await fetch(`${base}/rest/v1/tenant_members`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tenant_id: tenantId,
      user_id: userId,
      role: 'owner',
    }),
  })

  if (!memRes.ok) {
    const memText = await memRes.text()
    await fetch(`${base}/rest/v1/tenants?id=eq.${tenantId}`, { method: 'DELETE', headers })
    await fetch(`${base}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers })
    return jsonResponse(500, {
      ok: false,
      error: 'member_insert_failed',
      detail: memText.slice(0, 400),
    })
  }

  return jsonResponse(200, {
    ok: true,
    tenantId,
    userId,
    email,
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim()
  const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  const anon = (process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  const secret = (process.env.MEOO_PROVISION_SECRET ?? '').trim()

  const tenantDomain =
    (
      process.env.VITE_SUPABASE_TENANT_EMAIL_DOMAIN ??
      process.env.TENANT_EMAIL_DOMAIN ??
      'users.meoo.test'
    ).trim() || 'users.meoo.test'

  const body = await req.text()

  if (supabaseUrl && serviceRole) {
    return provisionWithServiceRole(supabaseUrl, serviceRole, body, tenantDomain)
  }

  if (!supabaseUrl?.trim() || !anon?.trim() || !secret?.trim()) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'provision_not_configured',
        hint:
          '在 Vercel 环境变量中配置：① SUPABASE_URL（或 VITE_SUPABASE_URL）与 SUPABASE_SERVICE_ROLE_KEY（推荐，无需部署 Edge Function）；或 ② 同上 URL + SUPABASE_ANON_KEY（或 VITE_SUPABASE_ANON_KEY）+ MEOO_PROVISION_SECRET，并部署 Edge Function provision-tenant。租户邮箱域可用 VITE_SUPABASE_TENANT_EMAIL_DOMAIN 或 TENANT_EMAIL_DOMAIN。',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    )
  }

  try {
    const fnUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/provision-tenant`
    const upstream = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anon}`,
        apikey: anon,
        'x-meoo-provision-secret': secret,
      },
      body,
    })
    const text = await upstream.text()
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'provision_upstream_failed',
        detail: e instanceof Error ? e.message : String(e),
      }),
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    )
  }
}
