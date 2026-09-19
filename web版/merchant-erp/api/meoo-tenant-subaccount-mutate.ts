/**
 * POST /api/meoo-tenant-subaccount-mutate
 * 主账号（tenant_members.owner/admin）为同一租户创建可登录子账号。
 *
 * GoTrue 走 supabaseAdminFetch；租户表走 supabase-js + nodeSupabaseClientOptions（Node 20 须 ws transport）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import {
  readMerchantSupabaseAdminEnv,
  readMerchantSupabaseAnonKey,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { nodeSupabaseClientOptions } from '../src/lib/nodeSupabaseClientOptions.js'
import { supabaseAdminFetch } from '../src/lib/supabaseAdminFetch.js'

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

type ListedAuthUser = { id: string; email?: string | null }

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

function serviceHeaders(serviceRole: string): Record<string, string> {
  return {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    'Content-Type': 'application/json',
  }
}

/** 8888 上若未反代 GoTrue，回落到本机 :9999（路径无 /auth/v1 前缀） */
function gotrueAdminCandidates(supabaseUrl: string, rel: string): string[] {
  const base = supabaseUrl.replace(/\/$/, '')
  const relAuth = rel.startsWith('/') ? rel : `/${rel}`
  const out: string[] = []
  const add = (u: string) => {
    if (u && !out.includes(u)) out.push(u)
  }
  add(`${base}/auth/v1${relAuth}`)
  add(`http://127.0.0.1:9999${relAuth}`)
  const extra = (process.env.GOTRUE_URL ?? process.env.SUPABASE_GOTRUE_URL ?? '').trim().replace(/\/$/, '')
  if (extra) {
    if (/:(9999)\b/.test(extra) && !/\/auth\/v1$/i.test(extra)) add(`${extra}${relAuth}`)
    else add(`${extra}/auth/v1${relAuth}`)
  }
  return out
}

async function gotrueAdminFetch(
  supabaseUrl: string,
  rel: string,
  init: RequestInit,
): Promise<Response> {
  const urls = gotrueAdminCandidates(supabaseUrl, rel)
  let last: Response | undefined
  let lastErr = ''
  for (const url of urls) {
    try {
      const res = await supabaseAdminFetch(url, init)
      if (res.ok) return res
      last = res
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  if (last) return last
  throw new Error(lastErr || `无法连接 GoTrue ${urls[0] ?? rel}`)
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    return { raw: text.slice(0, 400) }
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

  try {
    await handleMutate(req, res)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    sendJson(res, 500, { ok: false, message: `创建子账号失败：${detail}`, detail })
  }
}

async function handleMutate(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  const anonKey = readMerchantSupabaseAnonKey()
  if (missingParts.length > 0 || !anonKey) {
    sendJson(res, 503, {
      ok: false,
      message: '服务端未配置登录服务：需 URL、SUPABASE_SERVICE_ROLE_KEY，以及 SUPABASE_ANON_KEY。',
    })
    return
  }

  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
  const m = /^Bearer\s+(\S+)/i.exec(authHeader.trim())
  const jwt = m?.[1]?.trim()
  if (!jwt) {
    sendJson(res, 401, { ok: false, message: '缺少登录凭证，请重新登录主账号' })
    return
  }

  const userRes = await gotrueAdminFetch(supabaseUrl, '/user', {
    headers: { apikey: anonKey, Authorization: `Bearer ${jwt}` },
  })
  const userJson = await readJson(userRes)
  const managerId = typeof userJson.id === 'string' ? userJson.id : ''
  if (!userRes.ok || !managerId) {
    sendJson(res, 401, { ok: false, message: '登录已失效，请重新登录主账号' })
    return
  }

  const admin = createClient(supabaseUrl, serviceRole, nodeSupabaseClientOptions())
  const headers = serviceHeaders(serviceRole)

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

  async function findUserIdByEmail(targetEmail: string): Promise<string> {
    const listRes = await gotrueAdminFetch(supabaseUrl, '/admin/users?page=1&per_page=1000', { headers })
    const listJson = await readJson(listRes)
    const users = (Array.isArray(listJson.users) ? listJson.users : []) as ListedAuthUser[]
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === targetEmail.toLowerCase())
    return hit?.id ?? ''
  }

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
    const selfEmail = typeof userJson.email === 'string' ? userJson.email.trim().toLowerCase() : ''
    if (selfEmail && email.toLowerCase() === selfEmail) {
      sendJson(res, 400, { ok: false, message: '子账号不能与当前登录主账号相同' })
      return
    }

    async function ensureMember(userId: string): Promise<string | null> {
      const { data: existing } = await admin
        .from('tenant_members')
        .select('tenant_id')
        .eq('user_id', userId)
        .maybeSingle()
      if (existing?.tenant_id === tenantId) return null
      if (existing?.tenant_id) return '该登录账号已在平台注册，请更换名称或联系管理员'
      const { error: insErr } = await admin.from('tenant_members').insert({
        tenant_id: tenantId,
        user_id: userId,
        role: 'member',
      })
      if (insErr) {
        if (/duplicate|unique/i.test(insErr.message)) return null
        return `写入租户成员失败：${insErr.message}`
      }
      return null
    }

    const createRes = await gotrueAdminFetch(supabaseUrl, '/admin/users', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { login_name: loginName, tenant_id: tenantId, is_subaccount: true },
      }),
    })
    const createJson = await readJson(createRes)
    let createdId =
      typeof createJson.id === 'string'
        ? createJson.id
        : typeof (createJson.user as { id?: string } | undefined)?.id === 'string'
          ? (createJson.user as { id: string }).id
          : ''
    const already =
      !createRes.ok &&
      /already|registered|exists/i.test(String(createJson.msg ?? createJson.message ?? createJson.raw ?? ''))
    if (already && !createdId) {
      createdId = await findUserIdByEmail(email)
      if (createdId) {
        await gotrueAdminFetch(supabaseUrl, `/admin/users/${createdId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ password }),
        })
      }
    }
    if (!createdId) {
      sendJson(res, already ? 409 : 400, {
        ok: false,
        message: already
          ? '该登录账号已在平台注册，请更换名称或联系管理员'
          : String(createJson.msg ?? createJson.message ?? '创建登录账号失败'),
      })
      return
    }

    const memFail = await ensureMember(createdId)
    if (memFail) {
      if (!already) {
        await gotrueAdminFetch(supabaseUrl, `/admin/users/${createdId}`, { method: 'DELETE', headers }).catch(
          () => undefined,
        )
      }
      sendJson(res, 500, { ok: false, message: memFail })
      return
    }

    sendJson(res, 200, { ok: true, cloudUserId: createdId, email })
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
      uid = await findUserIdByEmail(email)
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

    const upRes = await gotrueAdminFetch(supabaseUrl, `/admin/users/${uid}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ password }),
    })
    if (!upRes.ok) {
      const upJson = await readJson(upRes)
      sendJson(res, 400, { ok: false, message: String(upJson.msg ?? upJson.message ?? '重置密码失败') })
      return
    }
    sendJson(res, 200, { ok: true })
    return
  }

  if (action === 'delete') {
    const cloudUserId = String(body.cloudUserId ?? '').trim()
    let uid = cloudUserId
    if (!uid && email) uid = await findUserIdByEmail(email)
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
    await gotrueAdminFetch(supabaseUrl, `/admin/users/${uid}`, { method: 'DELETE', headers }).catch(() => undefined)
    sendJson(res, 200, { ok: true })
    return
  }

  sendJson(res, 400, { ok: false, message: '未知 action' })
}
