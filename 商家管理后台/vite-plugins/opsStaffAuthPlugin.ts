/**
 * dev：运营管控台账号登录 / 列表 / 变更（与 Vercel api/meoo-ops-staff-* 一致）。
 */
import { createClient } from '@supabase/supabase-js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import {
  bearerTokenFromAuthHeader,
  createOpsSubAccountInDb,
  deleteOpsSubAccountInDb,
  listOpsStaffAccountsPublic,
  migrateOpsStaffAccountsInDb,
  requireSuperAdminSession,
  updateOpsSubAccountInDb,
  verifyOpsSessionToken,
  verifyOpsStaffLogin,
  type OpsPermissionKey,
} from '../api/_lib/opsStaffAccountsBackend'

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

function effectiveServiceRoleKey(supabaseUrl: string, fromEnv: string): string {
  const t = fromEnv.trim()
  if (isLocalSupabaseDemoUrl(supabaseUrl)) {
    if (process.env.SUPABASE_LOCAL_USE_PRINTED_SERVICE_ROLE === '1' && t) return t
    return LOCAL_SUPABASE_DEMO_SERVICE_ROLE
  }
  return t
}

function json(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c)
  return Buffer.concat(chunks).toString('utf8')
}

const STAFF_PATHS = new Set([
  '/api/meoo-ops-staff-login',
  '/api/meoo-ops-staff-list',
  '/api/meoo-ops-staff-mutate',
])

export function opsStaffAuthPlugin(): Plugin {
  return {
    name: 'meoo-ops-staff-auth',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = (req.url ?? '').split('?')[0]
        if (!STAFF_PATHS.has(urlPath)) return next()

        const method = req.method ?? 'GET'
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        if (method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '')
          .trim()
          .replace(/\/$/, '')
        const effectiveKey = effectiveServiceRoleKey(
          supabaseUrl,
          (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
        )
        if (!supabaseUrl || !effectiveKey) {
          json(res, 503, { ok: false, error: 'supabase_admin_not_configured' })
          return
        }

        const admin = createClient(supabaseUrl, effectiveKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })

        try {
          if (method === 'POST' && urlPath === '/api/meoo-ops-staff-login') {
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as { phone?: string; password?: string }
            const r = await verifyOpsStaffLogin(
              admin,
              String(body.phone ?? ''),
              String(body.password ?? ''),
              process.env,
            )
            if (!r.ok) {
              json(res, 401, { ok: false, message: '账号或密码错误', code: r.error })
              return
            }
            json(res, 200, {
              ok: true,
              sessionToken: r.sessionToken,
              session: {
                accountId: r.session.accountId,
                phone: r.session.phone,
                displayName: r.session.displayName,
                role: r.session.role,
                permissions: r.session.permissions,
                loginAt: r.session.loginAt,
              },
              account: r.account,
            })
            return
          }

          if (method === 'GET' && urlPath === '/api/meoo-ops-staff-list') {
            const token = bearerTokenFromAuthHeader(req.headers.authorization)
            const payload = verifyOpsSessionToken(token, process.env)
            if (!payload) {
              json(res, 401, { ok: false, message: '未登录或会话已过期' })
              return
            }
            const accounts = await listOpsStaffAccountsPublic(admin)
            json(res, 200, { ok: true, accounts })
            return
          }

          if (method === 'POST' && urlPath === '/api/meoo-ops-staff-mutate') {
            const token = bearerTokenFromAuthHeader(req.headers.authorization)
            const auth = await requireSuperAdminSession(admin, token, process.env)
            if (!auth.ok) {
              json(res, auth.status, {
                ok: false,
                message: auth.error === 'super_admin_required' ? '仅主账号可操作' : '未登录或会话已过期',
                code: auth.error,
              })
              return
            }
            const raw = await readBody(req)
            const body = JSON.parse(raw || '{}') as Record<string, unknown>
            const action = String(body.action ?? '').trim().toLowerCase()

            if (action === 'create') {
              const permissions = Array.isArray(body.permissions)
                ? (body.permissions.filter(Boolean) as OpsPermissionKey[])
                : []
              const r = await createOpsSubAccountInDb(admin, {
                phone: String(body.phone ?? ''),
                displayName: String(body.displayName ?? ''),
                password: String(body.password ?? ''),
                permissions,
              })
              if (!r.ok) {
                json(res, 400, { ok: false, code: r.error, message: r.error })
                return
              }
              json(res, 200, { ok: true, account: r.account })
              return
            }

            if (action === 'update') {
              const id = String(body.id ?? '').trim()
              const permissions = Array.isArray(body.permissions)
                ? (body.permissions.filter(Boolean) as OpsPermissionKey[])
                : undefined
              const passwordRaw = body.password != null ? String(body.password) : undefined
              const r = await updateOpsSubAccountInDb(admin, id, {
                displayName: body.displayName != null ? String(body.displayName) : undefined,
                permissions,
                status:
                  body.status === 'disabled' ? 'disabled' : body.status === 'active' ? 'active' : undefined,
                password: passwordRaw?.trim() ? passwordRaw : undefined,
              })
              if (!r.ok) {
                json(res, 400, { ok: false, code: r.error, message: r.error })
                return
              }
              json(res, 200, { ok: true })
              return
            }

            if (action === 'delete') {
              const id = String(body.id ?? '').trim()
              const r = await deleteOpsSubAccountInDb(admin, id)
              if (!r.ok) {
                json(res, 400, { ok: false, code: r.error, message: r.error })
                return
              }
              json(res, 200, { ok: true })
              return
            }

            if (action === 'migrate_local') {
              const rawAccounts = body.accounts
              if (!Array.isArray(rawAccounts)) {
                json(res, 400, { ok: false, message: 'accounts_required' })
                return
              }
              const accounts = rawAccounts
                .map((row) => {
                  if (!row || typeof row !== 'object') return null
                  const o = row as Record<string, unknown>
                  return {
                    id: String(o.id ?? ''),
                    phone: String(o.phone ?? ''),
                    displayName: String(o.displayName ?? ''),
                    role: o.role === 'super_admin' ? ('super_admin' as const) : ('sub_admin' as const),
                    passwordHash: String(o.passwordHash ?? ''),
                    permissions: Array.isArray(o.permissions)
                      ? (o.permissions.filter(Boolean) as OpsPermissionKey[])
                      : [],
                    status: o.status === 'disabled' ? ('disabled' as const) : ('active' as const),
                    createdAt: String(o.createdAt ?? ''),
                    updatedAt: String(o.updatedAt ?? ''),
                  }
                })
                .filter((x): x is NonNullable<typeof x> => x != null)
              const r = await migrateOpsStaffAccountsInDb(admin, accounts)
              if (!r.ok) {
                json(res, 400, { ok: false, message: r.error })
                return
              }
              json(res, 200, { ok: true, imported: r.imported })
              return
            }

            json(res, 400, { ok: false, message: 'unknown_action' })
            return
          }

          json(res, 405, { ok: false, message: 'Method Not Allowed' })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          if (/ops_staff_accounts|does not exist|Could not find|schema cache/i.test(msg)) {
            json(res, 503, {
              ok: false,
              error: 'ops_staff_table_missing',
              hint: '请在 Supabase 执行迁移 20260524120000_ops_staff_accounts.sql',
            })
            return
          }
          json(res, 500, { ok: false, message: msg.slice(0, 400) })
        }
      })
    },
  }
}
