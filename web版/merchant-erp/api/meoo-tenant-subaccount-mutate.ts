/**
 * POST /api/meoo-tenant-subaccount-mutate
 * 主账号（tenant_members.owner/admin）为同一租户创建 Supabase 登录子账号，子账号可用登录页 + 租户邮箱域登录 ERP。
 *
 * Body JSON:
 * - { action: "create", loginName, password }
 * - { action: "reset_password", loginName?, password, cloudUserId? }
 * - { action: "delete", loginName?, cloudUserId? }
 *
 * 需在 Vercel 配置：SUPABASE_URL（或 VITE_SUPABASE_URL）、SUPABASE_SERVICE_ROLE_KEY、SUPABASE_ANON_KEY（或 VITE_SUPABASE_ANON_KEY），
 * 以及 TENANT_EMAIL_DOMAIN（或 VITE_SUPABASE_TENANT_EMAIL_DOMAIN，与登录页一致）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import {
  readMerchantSupabaseAdminEnv,
  readMerchantSupabaseAnonKey,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'

export const config = { maxDuration: 30 }

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  cors(res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function loginNameToEmail(loginName: string, domain: string): string {
  const slug = loginName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${slug || 'user'}@${domain}`
}

function tenantEmailDomain(): string {
  const d = (
    process.env.VITE_SUPABASE_TENANT_EMAIL_DOMAIN ??
    process.env.TENANT_EMAIL_DOMAIN ??
    'users.meoo.test'
  )
    .trim()
    .replace(/^@/, '')
  return d || 'users.meoo.test'
}

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return '{}'
  } catch {
    return '{}'
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  cors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'method_not_allowed' })
    return
  }

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  const anonKey = readMerchantSupabaseAnonKey()
  if (missingParts.length > 0 || !anonKey) {
    sendJson(res, 503, {
      ok: false,
      message:
        '服务端未配置 Supabase：需 URL、SUPABASE_SERVICE_ROLE_KEY，以及 SUPABASE_ANON_KEY（用于校验当前登录）。',
    })
    return
  }

  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
  const m = /^Bearer\s+(\S+)/i.exec(authHeader.trim())
  const jwt = m?.[1]?.trim()
  if (!jwt) {
    sendJson(res, 401, { ok: false, message: '缺少 Authorization: Bearer <access_token>' })
    return
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user?.id) {
    sendJson(res, 401, { ok: false, message: '登录已失效，请重新登录主账号' })
    return
  }
  const managerId = userData.user.id

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: mems, error: memErr } = await admin.from('tenant_members').select('tenant_id, role').eq('user_id', managerId)

  if (memErr || !mems?.length) {
    sendJson(res, 403, { ok: false, message: '当前账号未关联商户，无法管理子账号' })
    return
  }

  const manage = mems.find((r) => r.role === 'owner' || r.role === 'admin')
  if (!manage?.tenant_id) {
    sendJson(res, 403, { ok: false, message: '仅商户负责人或管理员可管理子账号' })
    return
  }
  const tenantId = manage.tenant_id as string

  let body: { action?: string; loginName?: string; password?: string; cloudUserId?: string }
  try {
    body = JSON.parse(rawBody(req) || '{}') as typeof body
  } catch {
    sendJson(res, 400, { ok: false, message: '请求体须为 JSON' })
    return
  }

  const action = String(body.action ?? '').trim().toLowerCase()
  const loginName = String(body.loginName ?? '').trim()
  const domain = tenantEmailDomain()
  const email = loginName ? loginNameToEmail(loginName, domain) : ''

  if (action === 'create') {
    const password = String(body.password ?? '')
    if (loginName.length < 2 || loginName.length > 64) {
      sendJson(res, 400, { ok: false, message: '登录账号长度无效' })
      return
    }
    if (password.length < 6) {
      sendJson(res, 400, { ok: false, message: '密码至少 6 位' })
      return
    }
    const selfEmail = (userData.user.email ?? '').trim().toLowerCase()
    if (selfEmail && email.toLowerCase() === selfEmail) {
      sendJson(res, 400, { ok: false, message: '子账号不能与当前登录主账号相同' })
      return
    }

    const { data: created, error: cuErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { login_name: loginName, tenant_id: tenantId, is_subaccount: true },
    })
    if (cuErr || !created.user) {
      const msg = (cuErr?.message ?? '').toLowerCase()
      if (msg.includes('already') || msg.includes('registered')) {
        sendJson(res, 409, { ok: false, message: '该登录账号已在平台注册，请更换名称或联系管理员' })
        return
      }
      sendJson(res, 400, { ok: false, message: cuErr?.message ?? '创建登录账号失败' })
      return
    }

    const { error: insErr } = await admin.from('tenant_members').insert({
      tenant_id: tenantId,
      user_id: created.user.id,
      role: 'member',
    })

    if (insErr) {
      await admin.auth.admin.deleteUser(created.user.id)
      sendJson(res, 500, { ok: false, message: `写入租户成员失败：${insErr.message}` })
      return
    }

    sendJson(res, 200, { ok: true, cloudUserId: created.user.id, email })
    return
  }

  if (action === 'reset_password') {
    const password = String(body.password ?? '')
    const cloudUserId = String(body.cloudUserId ?? '').trim()
    if (password.length < 6) {
      sendJson(res, 400, { ok: false, message: '密码至少 6 位' })
      return
    }
    let uid = cloudUserId
    if (!uid) {
      if (!email) {
        sendJson(res, 400, { ok: false, message: '缺少 loginName 或 cloudUserId' })
        return
      }
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      uid = list?.users?.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase())?.id ?? ''
    }
    if (!uid) {
      sendJson(res, 404, { ok: false, message: '未找到该子账号的云端登录，请重新创建子账号后再试' })
      return
    }

    const { data: memRow } = await admin
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', uid)
      .maybeSingle()
    if (memRow?.tenant_id !== tenantId) {
      sendJson(res, 403, { ok: false, message: '无权重置该账号密码' })
      return
    }

    const { error: upErr } = await admin.auth.admin.updateUserById(uid, { password })
    if (upErr) {
      sendJson(res, 400, { ok: false, message: upErr.message })
      return
    }
    sendJson(res, 200, { ok: true })
    return
  }

  if (action === 'delete') {
    const cloudUserId = String(body.cloudUserId ?? '').trim()
    let uid = cloudUserId
    if (!uid && email) {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      uid = list?.users?.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase())?.id ?? ''
    }
    if (!uid) {
      sendJson(res, 200, { ok: true, skipped: true })
      return
    }

    const { data: memRow } = await admin
      .from('tenant_members')
      .select('tenant_id, role')
      .eq('user_id', uid)
      .maybeSingle()
    if (memRow?.tenant_id !== tenantId) {
      sendJson(res, 403, { ok: false, message: '无权删除该账号' })
      return
    }
    if (memRow.role === 'owner') {
      sendJson(res, 400, { ok: false, message: '不能删除商户主账号' })
      return
    }

    await admin.from('tenant_members').delete().eq('user_id', uid).eq('tenant_id', tenantId)
    await admin.auth.admin.deleteUser(uid)
    sendJson(res, 200, { ok: true })
    return
  }

  sendJson(res, 400, { ok: false, message: '未知 action' })
}
