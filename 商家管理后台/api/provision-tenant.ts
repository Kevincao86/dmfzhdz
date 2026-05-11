/**
 * Vercel Serverless（Node）：手动创建租户。
 *
 * 使用 Node 运行时以便正确读取 Vercel「Sensitive」环境变量（Edge 对部分密钥支持不完善）。
 *
 * 优先路径：VITE_SUPABASE_URL（或 SUPABASE_URL）+ SUPABASE_SERVICE_ROLE_KEY —— 直连 Supabase Admin API，无需 Edge Function。
 * 备选：同上 URL + ANON_KEY + MEOO_PROVISION_SECRET → 转发 Supabase Edge Function provision-tenant。
 *
 * 本地开发仍由 vite-plugins/provisionTenantProxy 处理同源 POST。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendOpsJson } from './safeOpsJson'

export const config = { maxDuration: 60 }

function bodyRaw(req: VercelRequest): string {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object')
    return JSON.stringify(req.body)
  return '{}'
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

async function sendFetchResponse(res: VercelResponse, r: Response): Promise<void> {
  const text = await r.text()
  const code = Number(r.status)
  const status = Number.isFinite(code) && code >= 100 && code <= 599 ? code : 500
  if (!res.writableEnded) {
    res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(text)
  }
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

async function forwardToProvisionEdge(
  supabaseUrl: string,
  anon: string,
  secret: string,
  body: string,
): Promise<Response> {
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
    return jsonResponse(502, {
      ok: false,
      error: 'provision_upstream_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    if (req.method !== 'POST') {
      res.status(405).send(JSON.stringify({ ok: false, error: 'method_not_allowed' }))
      return
    }

    const rawBody = bodyRaw(req)

    const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim()
    const serviceRole = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE ??
      ''
    ).trim()
    const anon = (process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
    const secret = (process.env.MEOO_PROVISION_SECRET ?? '').trim()

    const tenantDomain =
      (
        process.env.VITE_SUPABASE_TENANT_EMAIL_DOMAIN ??
        process.env.TENANT_EMAIL_DOMAIN ??
        'users.meoo.test'
      ).trim() || 'users.meoo.test'

    const missingEnv: string[] = []
    if (!supabaseUrl) missingEnv.push('VITE_SUPABASE_URL 或 SUPABASE_URL')
    if (!serviceRole) missingEnv.push('SUPABASE_SERVICE_ROLE_KEY（不要用 VITE_ 前缀；变量须勾选 Production）')
    if (!anon) missingEnv.push('SUPABASE_ANON_KEY 或 VITE_SUPABASE_ANON_KEY')
    if (!secret) missingEnv.push('MEOO_PROVISION_SECRET')

    if (supabaseUrl && serviceRole) {
      await sendFetchResponse(res, await provisionWithServiceRole(supabaseUrl, serviceRole, rawBody, tenantDomain))
      return
    }

    if (supabaseUrl && anon && secret) {
      await sendFetchResponse(res, await forwardToProvisionEdge(supabaseUrl, anon, secret, rawBody))
      return
    }

    res.status(503).send(
      JSON.stringify({
        ok: false,
        error: 'provision_not_configured',
        missingEnv,
        hint:
          '推荐：在 Vercel 增加 SUPABASE_SERVICE_ROLE_KEY（与 Dashboard API service_role 一致）并重新部署。备选：配置 MEOO_PROVISION_SECRET 并在 Supabase 部署 Edge Function provision-tenant。',
      }),
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'provision_handler_failed',
      detail: msg.slice(0, 800),
    })
  }
}
