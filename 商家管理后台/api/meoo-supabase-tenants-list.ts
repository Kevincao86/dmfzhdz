/**
 * Vercel：GET /api/meoo-supabase-tenants-list
 *
 * 从 ops-supabase 子目录挪到 api 根：避免 Vercel 在深层路径与其它 api 邻居打包时异常崩溃。
 * 前端须请求本路径（见 supabaseTenantsApi）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 60 }

function sendOpsJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  try {
    if (res.writableEnded || res.headersSent) return
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(status).send(JSON.stringify(body))
  } catch {
    try {
      if (!res.writableEnded && !res.headersSent) res.end()
    } catch {
      /* noop */
    }
  }
}

function jsonSend(res: VercelResponse, status: number, payload: unknown): void {
  try {
    const raw = JSON.stringify(payload)
    if (!res.writableEnded && !res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.status(status).send(raw)
    }
  } catch {
    sendOpsJson(res, 500, { ok: false, error: 'json_send_failed' })
  }
}

type TenantRow = {
  id: string
  name: string
  account_status: string
  trial_days: number
  official_days: number
  wallet_balance_cents: number
  service_expire_at: string | null
  membership_plan?: string
  tokenmix_api_key?: string | null
  direct_ai_calls_used?: number
  direct_ai_usage_month?: string | null
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
    'id,name,account_status,trial_days,official_days,subscription_days,ops_gift_days,wallet_balance_cents,service_expire_at,membership_plan,tokenmix_api_key,direct_ai_calls_used,direct_ai_usage_month,created_at,updated_at'
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
    /wallet_balance_cents|service_expire_at|membership_plan|tokenmix_api_key|subscription_days|ops_gift_days|does not exist|Could not find|schema cache/i.test(ttext)
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
    let owner_phone = ''
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
            const meta = u.user_metadata as { login_name?: string; phone?: string } | undefined
            const email = typeof u.email === 'string' ? u.email : ''
            user_email = email
            login_name =
              (typeof meta?.login_name === 'string' && meta.login_name.trim()) ||
              (email ? email.split('@')[0] ?? '' : '')
            const metaPhone = typeof meta?.phone === 'string' ? meta.phone.replace(/\D/g, '') : ''
            const authPhone =
              typeof u.phone === 'string' ? u.phone.replace(/\D/g, '').replace(/^86/, '') : ''
            owner_phone =
              (metaPhone.length === 11 ? metaPhone : '') ||
              (authPhone.length === 11 ? authPhone : authPhone.length === 13 && authPhone.startsWith('86') ? authPhone.slice(2) : '')
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    }
    out.push({
      tenant_id: t.id,
      merchant_name: t.name,
      login_name: login_name || '—',
      user_email,
      owner_phone: owner_phone || null,
      account_status: t.account_status,
      trial_days: t.trial_days,
      official_days: t.official_days,
      subscription_days:
        typeof t.subscription_days === 'number' ? t.subscription_days : t.official_days,
      ops_gift_days: typeof t.ops_gift_days === 'number' ? t.ops_gift_days : 0,
      wallet_balance_cents: typeof t.wallet_balance_cents === 'number' ? t.wallet_balance_cents : 0,
      service_expire_at: t.service_expire_at ?? null,
      membership_plan: t.membership_plan ?? 'member',
      tokenmix_bound: !!(typeof t.tokenmix_api_key === 'string' && t.tokenmix_api_key.trim()),
      direct_ai_calls_used:
        typeof t.direct_ai_calls_used === 'number' ? t.direct_ai_calls_used : 0,
      direct_ai_usage_month: t.direct_ai_usage_month ?? null,
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
    if (req.method !== 'GET') {
      jsonSend(res, 405, { ok: false, error: 'method_not_allowed' })
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
      jsonSend(res, 503, {
        ok: false,
        error: 'supabase_admin_not_configured',
        hint: '配置 VITE_SUPABASE_URL 或 SUPABASE_URL（Production 环境）。',
      })
      return
    }

    if (serviceRole) {
      const lr = await listTenantsWithServiceRoleFetch(supabaseUrl, serviceRole)
      if (lr.ok) {
        jsonSend(res, 200, { ok: true, rows: lr.rows })
        return
      } else {
        const listErr = lr
        if (anon && secret) {
          const er = await edgePost(supabaseUrl, anon, secret, {})
          if (er.ok && er.data.ok !== false) {
            const rows = Array.isArray(er.data.rows) ? er.data.rows : []
            jsonSend(res, 200, { ok: true, rows })
            return
          }
          const detail = [listErr.detail, JSON.stringify(er.data).slice(0, 400)].filter(Boolean).join(' | ')
          jsonSend(res, er.status >= 400 ? er.status : 502, {
            ok: false,
            error: 'list_failed',
            detail,
            hint:
              'Service Role 列租户失败，且 Edge ops-list-tenants 无有效数据。请核对 SUPABASE_SERVICE_ROLE_KEY、数据库权限，或部署 ops-list-tenants。',
          })
          return
        }
        jsonSend(res, 502, {
          ok: false,
          error: listErr.message,
          detail: listErr.detail,
          hint: '请核对 SUPABASE_SERVICE_ROLE_KEY 与数据库 tenants / tenant_members 表。',
        })
        return
      }
    }

    if (anon && secret) {
      const er = await edgePost(supabaseUrl, anon, secret, {})
      if (!er.ok || er.data.ok === false) {
        const detail = JSON.stringify(er.data).slice(0, 800)
        jsonSend(res, er.status >= 400 ? er.status : 502, {
          ok: false,
          error: 'edge_list_failed',
          detail,
          hint: '未配置 SUPABASE_SERVICE_ROLE_KEY 时依赖 Edge ops-list-tenants；请部署该函数并配置 MEOO_PROVISION_SECRET。',
        })
        return
      }
      const rows = Array.isArray(er.data.rows) ? er.data.rows : []
      jsonSend(res, 200, { ok: true, rows })
      return
    }

    jsonSend(res, 503, {
      ok: false,
      error: 'supabase_admin_not_configured',
      hint:
        '请配置 SUPABASE_SERVICE_ROLE_KEY（推荐），或 SUPABASE_ANON_KEY + MEOO_PROVISION_SECRET 并部署 ops-list-tenants。',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'tenants_list_handler_failed',
      detail: msg.slice(0, 800),
    })
  }
}
