import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from '../createOpsServiceRoleClient.js'
import {
  bearerTokenFromAuthHeader,
  createOpsSubAccountInDb,
  deleteOpsSubAccountInDb,
  migrateOpsStaffAccountsInDb,
  requireSuperAdminSession,
  updateOpsSubAccountInDb,
  type OpsPermissionKey,
} from '../opsStaffAccountsBackend.js'
import { sendOpsJson } from '../safeOpsJson.js'

function rawBody(req: import('@vercel/node').VercelRequest): string {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object')
    return JSON.stringify(req.body)
  return '{}'
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendOpsJson(res, 405, { ok: false, message: 'Method Not Allowed' })
    return
  }

  const token = bearerTokenFromAuthHeader(req.headers.authorization)
  const auth = await (async () => {
    const client = createOpsServiceRoleClient()
    if (!client.ok) return { client, auth: null as null }
    const r = await requireSuperAdminSession(client.admin, token, process.env)
    return { client, auth: r }
  })()

  if (!auth.client.ok) {
    sendOpsJson(res, auth.client.status, auth.client.body)
    return
  }
  if (!auth.auth || !auth.auth.ok) {
    sendOpsJson(res, auth.auth?.status ?? 401, {
      ok: false,
      message: auth.auth?.error === 'super_admin_required' ? '仅主账号可操作' : '未登录或会话已过期',
      code: auth.auth?.error ?? 'invalid_session',
    })
    return
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
  } catch {
    sendOpsJson(res, 400, { ok: false, message: 'invalid_json' })
    return
  }

  const action = String(body.action ?? '').trim().toLowerCase()

  try {
    if (action === 'create') {
      const permissions = Array.isArray(body.permissions)
        ? (body.permissions.filter(Boolean) as OpsPermissionKey[])
        : []
      const r = await createOpsSubAccountInDb(auth.client.admin, {
        phone: String(body.phone ?? ''),
        displayName: String(body.displayName ?? ''),
        password: String(body.password ?? ''),
        permissions,
      })
      if (!r.ok) {
        sendOpsJson(res, 400, { ok: false, code: r.error, message: r.error })
        return
      }
      sendOpsJson(res, 200, { ok: true, account: r.account })
      return
    }

    if (action === 'update') {
      const id = String(body.id ?? '').trim()
      const permissions = Array.isArray(body.permissions)
        ? (body.permissions.filter(Boolean) as OpsPermissionKey[])
        : undefined
      const passwordRaw = body.password != null ? String(body.password) : undefined
      const r = await updateOpsSubAccountInDb(auth.client.admin, id, {
        displayName: body.displayName != null ? String(body.displayName) : undefined,
        permissions,
        status:
          body.status === 'disabled' ? 'disabled' : body.status === 'active' ? 'active' : undefined,
        password: passwordRaw?.trim() ? passwordRaw : undefined,
      })
      if (!r.ok) {
        sendOpsJson(res, 400, { ok: false, code: r.error, message: r.error })
        return
      }
      sendOpsJson(res, 200, { ok: true })
      return
    }

    if (action === 'delete') {
      const id = String(body.id ?? '').trim()
      const r = await deleteOpsSubAccountInDb(auth.client.admin, id)
      if (!r.ok) {
        sendOpsJson(res, 400, { ok: false, code: r.error, message: r.error })
        return
      }
      sendOpsJson(res, 200, { ok: true })
      return
    }

    if (action === 'migrate_local') {
      const rawAccounts = body.accounts
      if (!Array.isArray(rawAccounts)) {
        sendOpsJson(res, 400, { ok: false, message: 'accounts_required' })
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
      const r = await migrateOpsStaffAccountsInDb(auth.client.admin, accounts)
      if (!r.ok) {
        sendOpsJson(res, 400, { ok: false, message: r.error })
        return
      }
      sendOpsJson(res, 200, { ok: true, imported: r.imported })
      return
    }

    sendOpsJson(res, 400, { ok: false, message: 'unknown_action' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/ops_staff_accounts|does not exist|Could not find|schema cache/i.test(msg)) {
      sendOpsJson(res, 503, {
        ok: false,
        error: 'ops_staff_table_missing',
        hint: '请在 Supabase 执行迁移 20260524120000_ops_staff_accounts.sql',
      })
      return
    }
    sendOpsJson(res, 500, { ok: false, message: msg.slice(0, 400) })
  }
}
