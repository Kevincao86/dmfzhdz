/**
 * Vercel Serverless（Node）：运营台列出 public.tenants + owner 登录信息。
 * 本地 dev 仍由 vite-plugins/opsSupabaseAdminPlugin 处理同源 GET。
 *
 * 使用原生 fetch 访问 PostgREST / Auth Admin，避免 @supabase/supabase-js 在部分 Vercel Serverless
 * 打包环境下触发运行时崩溃（表现为 FUNCTION_INVOCATION_FAILED、前端只看到 http_500）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendOpsJson } from '../../safeOpsJson'

export const config = { maxDuration: 60 }

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

function serviceRoleHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: 'application/json',
  }
}

async function listTenantsWithServiceRoleFetch(
  supabaseUrl: string,
  serviceKey: string,
): Promise<{ ok: true; rows: Record<string, unknown>[] } | { ok: false; message: string; detail?: string }> {
  const base = supabaseUrl.replace(/\/$/, '')
  const headers = serviceRoleHeaders(serviceKey)

  const fullTenantSelect =
    'id,name,account_status,trial_days,official_days,wallet_balance_cents,service_expire_at,created_at,updated_at'
  const fullUrl = `${base}/rest/v1/tenants?select=${encodeURIComponent(fullTenantSelect)}&order=created_at.desc`

  const tr = await fetch(fullUrl, { headers })
  const ttext = await tr.text()

  let trows: TenantRow[] | null = null

  if (tr.ok) {
    try {
      trows = JSON.parse(ttext || '[]') as TenantRow[]
    } catch {
      return { ok: false, message: 'tenants_select_failed', detail: ttext.slice(0, 400) }
    }
  } else if (
    /wallet_balance_cents|service_expire_at|does not exist|Could not find|schema cache/i.test(ttext)
  ) {
    const legacyUrl = `${base}/rest/v1/tenants?select=id,name,account_status,trial_days,official_days,created_at,updated_at&order=created_at.desc`
    const legacy = await fetch(legacyUrl, { headers })
    const ltext = await legacy.text()
    if (!legacy.ok) {
      return { ok: false, message: 'tenants_select_failed', detail: ltext.slice(0, 400) }
    }
    try {
      const legacyRows = JSON.parse(ltext || '[]') as Omit<
        TenantRow,
        'wallet_balance_cents' | 'service_expire_at'
      >[]
      trows = legacyRows.map((row) => ({
        ...row,
        wallet_balance_cents: 0,
        service_expire_at: null,
      }))
    } catch {
      return { ok: false, message: 'tenants_select_failed', detail: ltext.slice(0, 400) }
    }
  } else {
    return { ok: false, message: 'tenants_select_failed', detail: ttext.slice(0, 400) }
  }

  const memUrl = `${base}/rest/v1/tenant_members?select=tenant_id,user_id,role&role=eq.owner`
  const mr = await fetch(memUrl, { headers })
  const mtext = await mr.text()
  if (!mr.ok) {
    return { ok: false, message: 'members_select_failed', detail: mtext.slice(0, 400) }
  }
  let mrows: { tenant_id?: string; user_id?: string; role?: string }[]
  try {
    mrows = JSON.parse(mtext || '[]') as typeof mrows
  } catch {
    return { ok: false, message: 'members_select_failed', detail: mtext.slice(0, 400) }
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
      try {
        const ur = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
          headers,
        })
        const utext = await ur.text()
        if (ur.ok) {
          try {
            const wrap = JSON.parse(utext) as Record<string, unknown>
            const u = (wrap.user ?? wrap) as Record<string, unknown>
            const meta = u.user_metadata as { login_name?: string } | undefined
            const email = typeof u.email === 'string' ? u.email : ''
            user_email = email
            login_name =
              (typeof meta?.login_name === 'string' && meta.login_name.trim()) ||
              (email ? email.split('@')[0] ?? '' : '')
          } catch {
            /* 单条用户信息解析失败不影响列表 */
          }
        }
      } catch {
        /* 单条 Auth 请求失败不影响列表 */
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
  try {
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
      const lr = await listTenantsWithServiceRoleFetch(supabaseUrl, serviceRole)
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'tenants_list_handler_failed',
      detail: msg.slice(0, 800),
    })
  }
}
