/**
 * dev：列出 / 更新 public.tenants（客户管理）。
 * 有 Service Role（含本地 Supabase 默认 JWT）时在 Vite 进程内用 @supabase/supabase-js 列租户，无需 Edge/RPC；
 * 否则回退 Edge（ANON + MEOO_PROVISION_SECRET，与「手动创建」一致）。
 */
import { createClient } from '@supabase/supabase-js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import {
  confirmOpsPaymentOrderAdmin,
  deleteOpsPaymentOrderAdmin,
  listOpsPaymentOrders,
  verifyOpsPaymentOrderAdmin,
} from '../src/ops/paymentOrdersAdminBackend'
import {
  opsTenantPatchAdmin,
  opsTenantResetPasswordAdmin,
  opsTenantWalletLedgerAdmin,
} from '../api/lib/opsTenantsMutationsBackend'

/** 官方本地 `supabase start` 固定 demo JWT（仅用于 127.0.0.1:54321，勿用于线上）。 */
const LOCAL_SUPABASE_DEMO_SERVICE_ROLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

function isLocalSupabaseDemoUrl(supabaseUrl: string): boolean {
  try {
    const u = new URL(supabaseUrl)
    const port = u.port || (u.protocol === 'https:' ? '443' : '80')
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') && port === '54321'
  } catch {
    return false
  }
}

/** 浏览器侧常见为「fetch failed」，实为连不上 Supabase API（本地多为未 docker start）。 */
function supabaseUnreachableHint(...parts: (string | undefined)[]): string | undefined {
  const d = parts.filter(Boolean).join(' ')
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network error|Failed to fetch/i.test(d)) {
    return '无法连接 Supabase：请在「项目根」执行 npm run supabase:start（需 Docker 已运行），再重启商家管理后台 dev；或核对 .env.local 里 VITE_SUPABASE_URL 是否与 supabase status 的 API 地址一致。'
  }
  return undefined
}

/**
 * 本地 127.0.0.1:54321 固定使用 CLI 内置 demo service_role JWT。
 * 若在 .env.local 误填「云端」的 SUPABASE_SERVICE_ROLE_KEY，会导致 Admin 查询失败且 Edge 也往往不可用；
 * 需使用 `supabase status` 打印的密钥时，设置 SUPABASE_LOCAL_USE_PRINTED_SERVICE_ROLE=1。
 */
function effectiveServiceRoleKey(supabaseUrl: string, fromEnv: string): string {
  const t = fromEnv.trim()
  if (isLocalSupabaseDemoUrl(supabaseUrl)) {
    if (process.env.SUPABASE_LOCAL_USE_PRINTED_SERVICE_ROLE === '1' && t) return t
    return LOCAL_SUPABASE_DEMO_SERVICE_ROLE
  }
  return t
}

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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, code: number, body: unknown) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function edgePost(
  supabaseUrl: string,
  anon: string,
  secret: string,
  fn: 'ops-list-tenants' | 'ops-patch-tenant' | 'ops-reset-tenant-auth-password',
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${fn}`
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

export function opsSupabaseAdminPlugin(): Plugin {
  return {
    name: 'meoo-ops-supabase-admin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const reqUrl = req.url ?? ''
        const urlPath = reqUrl.split('?')[0]
        if (!urlPath.startsWith('/api/ops-supabase/')) return next()

        const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '')
        const serviceKeyEnv = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
        const effectiveKey = effectiveServiceRoleKey(supabaseUrl, serviceKeyEnv)
        const anon = (process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
        const secret = (process.env.MEOO_PROVISION_SECRET ?? '').trim()

        const method = req.method ?? 'GET'
        const sendCors = () => {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        }

        if (method === 'OPTIONS') {
          sendCors()
          res.statusCode = 204
          res.end()
          return
        }
        sendCors()

        const isOpsSupabaseRoute =
          urlPath === '/api/ops-supabase/tenants' ||
          urlPath === '/api/ops-supabase/tenants/wallet-ledger' ||
          urlPath === '/api/ops-supabase/tenants/patch' ||
          urlPath === '/api/ops-supabase/tenants/reset-password' ||
          urlPath === '/api/ops-supabase/payment-orders' ||
          urlPath === '/api/ops-supabase/payment-orders/verify' ||
          urlPath === '/api/ops-supabase/payment-orders/confirm' ||
          urlPath === '/api/ops-supabase/payment-orders/delete'
        if (!isOpsSupabaseRoute) {
          return next()
        }

        if (!supabaseUrl) {
          if (
            (urlPath === '/api/ops-supabase/tenants' && method === 'GET') ||
            (urlPath === '/api/ops-supabase/tenants/wallet-ledger' && method === 'GET') ||
            (urlPath === '/api/ops-supabase/payment-orders' && method === 'GET')
          ) {
            json(res, 503, {
              ok: false,
              error: 'supabase_admin_not_configured',
              hint: '在 .env.local 配置 VITE_SUPABASE_URL',
            })
            return
          }
          return next()
        }

        try {
          if (method === 'GET' && urlPath === '/api/ops-supabase/tenants') {
            let rows: unknown[] = []

            if (effectiveKey) {
              const lr = await listTenantsWithAdminClient(supabaseUrl, effectiveKey)
              if (lr.ok) {
                rows = lr.rows
              } else if (anon && secret) {
                const er = await edgePost(supabaseUrl, anon, secret, 'ops-list-tenants', {})
                if (er.ok && er.data.ok !== false) {
                  rows = Array.isArray(er.data.rows) ? (er.data.rows as unknown[]) : []
                } else {
                  const detail = [lr.detail, JSON.stringify(er.data).slice(0, 400)].filter(Boolean).join(' | ')
                  json(res, er.status >= 400 ? er.status : 502, {
                    ok: false,
                    error: 'list_failed',
                    detail,
                    hint:
                      supabaseUnreachableHint(detail, lr.detail) ??
                      '本机 Admin 列租户失败且 Edge 无数据。请确认 supabase start 已起、表 tenants/tenant_members 存在；或部署 ops-list-tenants 并 functions serve',
                  })
                  return
                }
              } else {
                json(res, 502, {
                  ok: false,
                  error: lr.message,
                  detail: lr.detail,
                  hint:
                    supabaseUnreachableHint(lr.detail) ??
                    '本地 54321 未写 SUPABASE_SERVICE_ROLE_KEY 时会使用 CLI 内置 demo service_role；若仍失败请检查数据库或配置 ANON+MEOO_PROVISION_SECRET 并部署 ops-list-tenants',
                })
                return
              }
            } else if (anon && secret) {
              const er = await edgePost(supabaseUrl, anon, secret, 'ops-list-tenants', {})
              if (!er.ok || er.data.ok === false) {
                const detail = JSON.stringify(er.data).slice(0, 800)
                json(res, er.status >= 400 ? er.status : 502, {
                  ok: false,
                  error: 'edge_list_failed',
                  detail,
                  hint:
                    supabaseUnreachableHint(detail) ??
                    '请确认已部署 Edge「ops-list-tenants」，且本机执行 supabase functions serve；或与 provision-tenant 共用 MEOO_PROVISION_SECRET。本地 Supabase 也可在 .env.local 不写 service_role（54321 将自动使用 demo JWT）',
                })
                return
              }
              rows = Array.isArray(er.data.rows) ? (er.data.rows as unknown[]) : []
            } else {
              json(res, 503, {
                ok: false,
                error: 'supabase_admin_not_configured',
                hint:
                  '配置 VITE_SUPABASE_URL；本地 54321 可不写 SUPABASE_SERVICE_ROLE_KEY。或配置 SUPABASE_ANON_KEY + MEOO_PROVISION_SECRET 并部署 ops-list-tenants',
              })
              return
            }

            json(res, 200, { ok: true, rows })
            return
          }

          if (method === 'GET' && urlPath === '/api/ops-supabase/tenants/wallet-ledger') {
            if (!effectiveKey) {
              json(res, 503, {
                ok: false,
                error: 'supabase_admin_not_configured',
                hint:
                  '钱包流水查询需要 Service Role：请在 .env.local 配置 SUPABASE_SERVICE_ROLE_KEY（本地 supabase start 可不写，将使用内置 demo JWT）',
              })
              return
            }
            let tenantId = ''
            try {
              tenantId = new URL(reqUrl, 'http://vite.local').searchParams.get('tenant_id')?.trim() ?? ''
            } catch {
              tenantId = ''
            }
            const admin = createClient(supabaseUrl, effectiveKey, {
              auth: { autoRefreshToken: false, persistSession: false },
            })
            const lr = await opsTenantWalletLedgerAdmin(admin, tenantId)
            if (!lr.ok) {
              const hint =
                lr.status === 502 && typeof lr.body.detail === 'string'
                  ? supabaseUnreachableHint(lr.body.detail as string)
                  : undefined
              json(res, lr.status, hint ? { ...lr.body, hint } : lr.body)
              return
            }
            json(res, 200, { ok: true, rows: lr.rows })
            return
          }

          if (method === 'POST' && urlPath === '/api/ops-supabase/tenants/patch') {
            const raw = await readBody(req as IncomingMessage)
            let body: Record<string, unknown>
            try {
              body = JSON.parse(raw || '{}') as Record<string, unknown>
            } catch {
              json(res, 400, { ok: false, error: 'invalid_json' })
              return
            }

            if (effectiveKey) {
              const admin = createClient(supabaseUrl, effectiveKey, {
                auth: { autoRefreshToken: false, persistSession: false },
              })
              const pr = await opsTenantPatchAdmin(admin, body)
              if (!pr.ok) {
                json(res, pr.status, pr.body)
                return
              }
              json(res, 200, { ok: true })
              return
            }

            if (anon && secret) {
              const er = await edgePost(supabaseUrl, anon, secret, 'ops-patch-tenant', body)
              if (!er.ok || er.data.ok === false) {
                json(res, er.status >= 400 ? er.status : 502, {
                  ok: false,
                  error: 'edge_patch_failed',
                  detail: JSON.stringify(er.data).slice(0, 600),
                })
                return
              }
              json(res, 200, { ok: true })
              return
            }

            json(res, 503, {
              ok: false,
              error: 'supabase_admin_not_configured',
              hint: '配置 SUPABASE_SERVICE_ROLE_KEY，或 ANON+MEOO_PROVISION_SECRET 并部署 ops-patch-tenant',
            })
            return
          }

          if (method === 'POST' && urlPath === '/api/ops-supabase/tenants/reset-password') {
            const raw = await readBody(req as IncomingMessage)
            let body: Record<string, unknown>
            try {
              body = JSON.parse(raw || '{}') as Record<string, unknown>
            } catch {
              json(res, 400, { ok: false, error: 'invalid_json' })
              return
            }

            if (effectiveKey) {
              const admin = createClient(supabaseUrl, effectiveKey, {
                auth: { autoRefreshToken: false, persistSession: false },
              })
              const rr = await opsTenantResetPasswordAdmin(admin, body)
              if (!rr.ok) {
                json(res, rr.status, rr.body)
                return
              }
              json(res, 200, { ok: true })
              return
            }

            const id = typeof body.id === 'string' ? body.id.trim() : ''
            const rawPw = typeof body.password === 'string' ? body.password : ''
            const password = rawPw.length >= 6 ? rawPw : '123456'

            if (anon && secret) {
              const er = await edgePost(supabaseUrl, anon, secret, 'ops-reset-tenant-auth-password', {
                id,
                password,
              })
              if (!er.ok || er.data.ok === false) {
                json(res, er.status >= 400 ? er.status : 502, {
                  ok: false,
                  error: 'edge_reset_failed',
                  detail: JSON.stringify(er.data).slice(0, 600),
                })
                return
              }
              json(res, 200, { ok: true })
              return
            }

            json(res, 503, {
              ok: false,
              error: 'supabase_admin_not_configured',
              hint:
                '配置 SUPABASE_SERVICE_ROLE_KEY，或 ANON+MEOO_PROVISION_SECRET 并部署 ops-reset-tenant-auth-password',
            })
            return
          }

          if (method === 'GET' && urlPath === '/api/ops-supabase/payment-orders') {
            if (!effectiveKey) {
              json(res, 503, {
                ok: false,
                error: 'supabase_admin_not_configured',
                hint: '订单管理需要 Service Role：请在 .env.local 配置 SUPABASE_SERVICE_ROLE_KEY（本地 supabase start 可用 CLI 打印的 service_role key）',
              })
              return
            }
            const admin = createClient(supabaseUrl, effectiveKey, {
              auth: { autoRefreshToken: false, persistSession: false },
            })
            const lr = await listOpsPaymentOrders(admin)
            if (!lr.ok) {
              json(res, lr.status, lr.body)
              return
            }
            json(res, 200, { ok: true, rows: lr.data.rows })
            return
          }

          if (method === 'POST' && urlPath === '/api/ops-supabase/payment-orders/verify') {
            if (!effectiveKey) {
              json(res, 503, { ok: false, error: 'supabase_admin_not_configured' })
              return
            }
            const raw = await readBody(req as IncomingMessage)
            let body: Record<string, unknown>
            try {
              body = JSON.parse(raw || '{}') as Record<string, unknown>
            } catch {
              json(res, 400, { ok: false, error: 'invalid_json' })
              return
            }
            const admin = createClient(supabaseUrl, effectiveKey, {
              auth: { autoRefreshToken: false, persistSession: false },
            })
            const vr = await verifyOpsPaymentOrderAdmin(admin, body)
            if (!vr.ok) {
              json(res, vr.status, vr.body)
              return
            }
            json(res, 200, { ok: true })
            return
          }

          if (method === 'POST' && urlPath === '/api/ops-supabase/payment-orders/confirm') {
            if (!effectiveKey) {
              json(res, 503, { ok: false, error: 'supabase_admin_not_configured' })
              return
            }
            const raw = await readBody(req as IncomingMessage)
            let body: Record<string, unknown>
            try {
              body = JSON.parse(raw || '{}') as Record<string, unknown>
            } catch {
              json(res, 400, { ok: false, error: 'invalid_json' })
              return
            }
            const admin = createClient(supabaseUrl, effectiveKey, {
              auth: { autoRefreshToken: false, persistSession: false },
            })
            const cr = await confirmOpsPaymentOrderAdmin(admin, body)
            if (!cr.ok) {
              json(res, cr.status, cr.body)
              return
            }
            json(res, 200, { ok: true })
            return
          }

          if (method === 'POST' && urlPath === '/api/ops-supabase/payment-orders/delete') {
            if (!effectiveKey) {
              json(res, 503, { ok: false, error: 'supabase_admin_not_configured' })
              return
            }
            const raw = await readBody(req as IncomingMessage)
            let body: Record<string, unknown>
            try {
              body = JSON.parse(raw || '{}') as Record<string, unknown>
            } catch {
              json(res, 400, { ok: false, error: 'invalid_json' })
              return
            }
            const admin = createClient(supabaseUrl, effectiveKey, {
              auth: { autoRefreshToken: false, persistSession: false },
            })
            const dr = await deleteOpsPaymentOrderAdmin(admin, body)
            if (!dr.ok) {
              json(res, dr.status, dr.body)
              return
            }
            json(res, 200, { ok: true })
            return
          }

          return next()
        } catch (e) {
          const detail = e instanceof Error ? e.message : String(e)
          json(res, 502, {
            ok: false,
            error: 'supabase_admin_error',
            detail,
            hint: supabaseUnreachableHint(detail),
          })
        }
      })
    },
  }
}
