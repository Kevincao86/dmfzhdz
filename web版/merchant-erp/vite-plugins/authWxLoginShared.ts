import { randomBytes } from 'node:crypto'

import { provisionMerchantTenant } from './authRegisterProvision.js'
import {
  createAdminSessionForUserId,
  loginNameToTenantEmail,
  smsLoginErrorMessage,
} from './authSmsAuthShared.js'
import { readMerchantSupabaseAdminEnv } from './merchantSupabaseAdminEnv.js'
import { erpWxCodeToOpenId } from '../src/lib/erpMpWechatAccess.js'
import { supabaseAdminFetch } from '../src/lib/supabaseAdminFetch.js'

const ERP_WX_OPENID_META_KEY = 'erp_wx_openid'

export type WxLoginResult =
  | {
      ok: true
      access_token: string
      refresh_token: string
      expires_in?: number
      loginName: string
      isNew: boolean
    }
  | { ok: false; error: string; message: string; detail?: string }

function wxOpenIdFromUserRecord(user: Record<string, unknown>): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined
  const raw = meta?.[ERP_WX_OPENID_META_KEY] ?? meta?.wx_openid ?? ''
  return String(raw || '').trim()
}

function loginNameFromUserRecord(user: Record<string, unknown>): string {
  const meta = user.user_metadata as { login_name?: string } | undefined
  const fromMeta = typeof meta?.login_name === 'string' ? meta.login_name.trim() : ''
  if (fromMeta) return fromMeta
  const email = typeof user.email === 'string' ? user.email : ''
  return email ? (email.split('@')[0] ?? '') : ''
}

export async function findAuthUserByErpWxOpenId(
  openid: string,
): Promise<{ userId: string; email: string; loginName: string } | null> {
  const needle = String(openid || '').trim()
  if (!needle) return null

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) return null

  const base = supabaseUrl.replace(/\/$/, '')
  const headers: Record<string, string> = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    'Content-Type': 'application/json',
  }

  let page = 1
  const perPage = 200
  while (page <= 20) {
    const res = await supabaseAdminFetch(
      `${base}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
      { headers },
    )
    const text = await res.text()
    if (!res.ok) return null
    let parsed: { users?: Record<string, unknown>[] } = {}
    try {
      parsed = JSON.parse(text) as typeof parsed
    } catch {
      return null
    }
    const users = Array.isArray(parsed.users) ? parsed.users : []
    for (const u of users) {
      if (wxOpenIdFromUserRecord(u) !== needle) continue
      const userId = typeof u.id === 'string' ? u.id : ''
      const email = typeof u.email === 'string' ? u.email : ''
      const loginName = loginNameFromUserRecord(u)
      if (userId && email) return { userId, email, loginName }
    }
    if (users.length < perPage) break
    page += 1
  }
  return null
}

export async function bindErpWxOpenIdToAuthUser(
  userId: string,
  openid: string,
  profile?: { wxNickName?: string; wxAvatarUrl?: string },
): Promise<{ ok: true } | { ok: false; error: string; message: string; detail?: string }> {
  const id = String(userId || '').trim()
  const wxOpenId = String(openid || '').trim()
  if (!id || !wxOpenId) {
    return { ok: false, error: 'invalid_bind', message: '绑定参数无效' }
  }

  const existing = await findAuthUserByErpWxOpenId(wxOpenId)
  if (existing && existing.userId !== id) {
    return {
      ok: false,
      error: 'wx_openid_already_bound',
      message: '该微信已绑定其他商家账号，请用原账号登录',
    }
  }

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) {
    return { ok: false, error: 'supabase_admin_not_configured', message: '登录服务未配置' }
  }

  const base = supabaseUrl.replace(/\/$/, '')
  const headers: Record<string, string> = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    'Content-Type': 'application/json',
  }

  const getRes = await supabaseAdminFetch(`${base}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    headers,
  })
  const getText = await getRes.text()
  if (!getRes.ok) {
    return { ok: false, error: 'user_lookup_failed', message: '账号不存在' }
  }
  let user: Record<string, unknown> = {}
  try {
    user = JSON.parse(getText) as Record<string, unknown>
  } catch {
    return { ok: false, error: 'user_lookup_failed', message: '账号解析失败' }
  }
  const prevMeta = (user.user_metadata as Record<string, unknown> | undefined) ?? {}
  const nextMeta: Record<string, unknown> = {
    ...prevMeta,
    [ERP_WX_OPENID_META_KEY]: wxOpenId,
  }
  const nick = String(profile?.wxNickName || '').trim()
  const avatar = String(profile?.wxAvatarUrl || '').trim()
  if (nick) nextMeta.wx_nick_name = nick
  if (avatar) nextMeta.wx_avatar_url = avatar

  const patchRes = await supabaseAdminFetch(`${base}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ user_metadata: nextMeta }),
  })
  if (!patchRes.ok) {
    const detail = (await patchRes.text()).slice(0, 240)
    return { ok: false, error: 'bind_failed', message: '微信绑定失败', detail }
  }
  return { ok: true }
}

function randomPassword(): string {
  return randomBytes(12).toString('base64url')
}

function loginNameFromOpenId(openid: string): string {
  const clean = openid.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  const tail = (clean || 'user').slice(-10)
  return `wx${tail}`.slice(0, 32)
}

async function registerMerchantByWxProfile(input: {
  openid: string
  wxNickName?: string
  wxAvatarUrl?: string
}): Promise<
  | { ok: true; userId: string; email: string; loginName: string }
  | { ok: false; error: string; message: string; detail?: string }
> {
  let loginName = loginNameFromOpenId(input.openid)
  const merchantName = String(input.wxNickName || '').trim() || '微信商家'
  const password = randomPassword()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const provision = await provisionMerchantTenant({
      loginName,
      password,
      merchantName,
      trialDays: 7,
      edition: 'merchant',
    })
    if (provision.ok) {
      const bind = await bindErpWxOpenIdToAuthUser(provision.userId, input.openid, {
        wxNickName: input.wxNickName,
        wxAvatarUrl: input.wxAvatarUrl,
      })
      if (!bind.ok) {
        return { ok: false, error: bind.error, message: bind.message }
      }
      return {
        ok: true,
        userId: provision.userId,
        email: provision.email,
        loginName,
      }
    }
    if (provision.error !== 'login_exists') {
      return {
        ok: false,
        error: provision.error,
        message: '微信注册失败，请稍后重试',
        detail: provision.detail,
      }
    }
    loginName = `${loginNameFromOpenId(input.openid)}${attempt + 2}`.slice(0, 32)
  }
  return { ok: false, error: 'login_exists', message: '微信注册失败，请改用账号密码登录' }
}

export function wxLoginErrorMessage(error: string, detail?: string): string {
  if (error === 'wx_not_configured') {
    return '微信登录未配置，请联系管理员配置 ERP_MP_WECHAT_APPID / ERP_MP_WECHAT_SECRET'
  }
  if (error === 'wx_openid_already_bound') {
    return '该微信已绑定其他商家账号，请用原账号登录'
  }
  if (error === 'invalid_wx_code') {
    return '微信授权已过期，请重试'
  }
  if (error === 'magiclink_failed' || error === 'verify_failed' || error === 'session_missing') {
    return smsLoginErrorMessage(error, detail)
  }
  return detail?.trim() || '微信登录失败，请稍后重试'
}

export async function signInWithWxLoginCode(input: {
  code: string
  stableDevOpenId?: string
  wxNickName?: string
  wxAvatarUrl?: string
}): Promise<WxLoginResult> {
  const code = String(input.code || '').trim()
  if (!code && !String(input.stableDevOpenId || '').trim()) {
    return { ok: false, error: 'invalid_wx_code', message: wxLoginErrorMessage('invalid_wx_code') }
  }

  let openid = ''
  try {
    const session = await erpWxCodeToOpenId(code, input.stableDevOpenId)
    openid = String(session.openid || '').trim()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/erp_wx_not_configured|wx_not_configured/i.test(msg)) {
      return { ok: false, error: 'wx_not_configured', message: wxLoginErrorMessage('wx_not_configured') }
    }
    return { ok: false, error: 'invalid_wx_code', message: wxLoginErrorMessage('invalid_wx_code', msg) }
  }
  if (!openid) {
    return { ok: false, error: 'invalid_wx_code', message: wxLoginErrorMessage('invalid_wx_code') }
  }

  let user = await findAuthUserByErpWxOpenId(openid)
  let isNew = false

  if (!user) {
    const reg = await registerMerchantByWxProfile({
      openid,
      wxNickName: input.wxNickName,
      wxAvatarUrl: input.wxAvatarUrl,
    })
    if (!reg.ok) {
      return { ok: false, error: reg.error, message: reg.message, detail: reg.detail }
    }
    user = { userId: reg.userId, email: reg.email, loginName: reg.loginName }
    isNew = true
  } else if (input.wxNickName || input.wxAvatarUrl) {
    await bindErpWxOpenIdToAuthUser(user.userId, openid, {
      wxNickName: input.wxNickName,
      wxAvatarUrl: input.wxAvatarUrl,
    })
  }

  const session = await createAdminSessionForUserId(user.userId, user.email || loginNameToTenantEmail(user.loginName))
  if (!session.ok) {
    return {
      ok: false,
      error: session.error,
      message: wxLoginErrorMessage(session.error, session.detail),
      detail: session.detail,
    }
  }

  return {
    ok: true,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    loginName: user.loginName,
    isNew,
  }
}

export async function tryBindWxCodeAfterLogin(input: {
  userId: string
  loginName: string
  code?: string
  stableDevOpenId?: string
  wxNickName?: string
  wxAvatarUrl?: string
}): Promise<void> {
  const code = String(input.code || '').trim()
  if (!code && !String(input.stableDevOpenId || '').trim()) return
  try {
    const session = await erpWxCodeToOpenId(code, input.stableDevOpenId)
    const openid = String(session.openid || '').trim()
    if (!openid) return
    await bindErpWxOpenIdToAuthUser(input.userId, openid, {
      wxNickName: input.wxNickName,
      wxAvatarUrl: input.wxAvatarUrl,
    })
  } catch {
    /* 绑定失败不阻断密码/短信登录 */
  }
}
