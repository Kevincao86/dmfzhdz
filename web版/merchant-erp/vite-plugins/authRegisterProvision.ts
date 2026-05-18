import { syncErpTenantToOpsRegistry } from './authRegistrySync.js'
import { readMerchantSupabaseAdminEnv } from './merchantSupabaseAdminEnv.js'

function loginNameToEmail(loginName: string, domain: string): string {
  const slug = loginName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${slug || 'user'}@${domain}`
}

function tenantEmailDomain(): string {
  return (
    process.env.VITE_SUPABASE_TENANT_EMAIL_DOMAIN ??
    process.env.TENANT_EMAIL_DOMAIN ??
    'users.meoo.test'
  )
    .trim()
    .replace(/^@/, '') || 'users.meoo.test'
}

export async function provisionMerchantTenant(body: {
  loginName: string
  password: string
  merchantName: string
  phone?: string
  trialDays?: number
}): Promise<{ ok: true; tenantId: string; userId: string; email: string } | { ok: false; error: string; detail?: string }> {
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) {
    return { ok: false, error: 'supabase_admin_not_configured', detail: missingParts.join(',') }
  }

  const loginName = body.loginName.trim()
  const password = body.password
  const merchantName = body.merchantName.trim()
  const trialDays = Math.max(0, Math.min(3650, Number(body.trialDays) || 14))
  const officialDays = 0

  if (!loginName || password.length < 6 || !merchantName) {
    return { ok: false, error: 'invalid_fields' }
  }

  const base = supabaseUrl.replace(/\/$/, '')
  const email = loginNameToEmail(loginName, tenantEmailDomain())
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
      phone: body.phone ? `+86${body.phone}` : undefined,
      user_metadata: {
        login_name: loginName,
        merchant_name: merchantName,
        phone: body.phone ?? '',
      },
    }),
  })

  const createText = await createRes.text()
  let createJson: { id?: string; user?: { id?: string }; msg?: string; message?: string } = {}
  try {
    createJson = JSON.parse(createText) as typeof createJson
  } catch {
    /* ignore */
  }
  const userId = typeof createJson.id === 'string' ? createJson.id : createJson.user?.id
  if (!createRes.ok || !userId) {
    const msg = String(createJson.msg ?? createJson.message ?? createText).toLowerCase()
    if (msg.includes('already been registered') || msg.includes('already exists')) {
      return { ok: false, error: 'login_exists' }
    }
    return { ok: false, error: 'auth_create_failed', detail: createText.slice(0, 400) }
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
    return { ok: false, error: 'tenant_insert_failed', detail: tenantText.slice(0, 400) }
  }

  const memRes = await fetch(`${base}/rest/v1/tenant_members`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tenant_id: tenantId, user_id: userId, role: 'owner' }),
  })
  if (!memRes.ok) {
    const memText = await memRes.text()
    await fetch(`${base}/rest/v1/tenants?id=eq.${tenantId}`, { method: 'DELETE', headers })
    await fetch(`${base}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers })
    return { ok: false, error: 'member_insert_failed', detail: memText.slice(0, 400) }
  }

  await syncErpTenantToOpsRegistry({
    tenantId,
    loginName,
    merchantName,
    phone: body.phone,
    trialDays,
  })

  return { ok: true, tenantId, userId, email }
}
