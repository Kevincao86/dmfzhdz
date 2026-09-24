import { randomBytes, randomInt } from 'node:crypto'
import net from 'node:net'
import tls from 'node:tls'
import { provisionMerchantTenant } from './authRegisterProvision.js'
import { normalizeCnMobile, verifySmsCode } from './authRegistrationOtp.js'
import {
  createAdminSessionForUserId,
  findAuthUserByPhone,
  phoneFromUserRecord,
  verifyAuthSmsCode,
} from './authSmsAuthShared.js'
import { readMerchantSupabaseAdminEnv } from './merchantSupabaseAdminEnv.js'
import { supabaseAdminFetch } from '../src/lib/supabaseAdminFetch.js'

export const ERP_WX_OPENID_META_KEY = 'erp_wx_openid'
export const ERP_DY_OPENID_META_KEY = 'erp_dy_openid'
export const ERP_BIND_EMAIL_META_KEY = 'bind_email'

const EMAIL_OTP_TTL_MS = 5 * 60 * 1000
const MERGE_TTL_MS = 15 * 60 * 1000
const emailOtpStore = new Map<string, { code: string; exp: number }>()
const mergeStore = new Map<
  string,
  { fromUserId: string; targetUserId: string; channel: 'phone' | 'email'; value: string; exp: number }
>()

export function normalizeBindEmail(raw: string): string | null {
  const t = String(raw || '').trim().toLowerCase()
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(t)) return null
  if (t.endsWith('@users.meoo.test')) return null
  return t
}

export function maskEmail(email: string): string {
  const [u, d] = email.split('@')
  if (!u || !d) return email
  const head = u.slice(0, Math.min(2, u.length))
  return `${head}***@${d}`
}

export function maskPhone(phone: string): string {
  const p = String(phone || '')
  if (p.length < 7) return p
  return `${p.slice(0, 3)}****${p.slice(-4)}`
}

export function userHasPhone(u: Record<string, unknown>): boolean {
  return Boolean(phoneFromUserRecord(u))
}

export function bindEmailFromUser(u: Record<string, unknown>): string {
  const meta = (u.user_metadata as Record<string, unknown> | undefined) ?? {}
  return normalizeBindEmail(String(meta[ERP_BIND_EMAIL_META_KEY] || '')) || ''
}

export function wxOpenIdFromUser(u: Record<string, unknown>): string {
  const meta = (u.user_metadata as Record<string, unknown> | undefined) ?? {}
  return String(meta[ERP_WX_OPENID_META_KEY] || meta.wx_openid || '').trim()
}

export function dyOpenIdFromUser(u: Record<string, unknown>): string {
  const meta = (u.user_metadata as Record<string, unknown> | undefined) ?? {}
  return String(meta[ERP_DY_OPENID_META_KEY] || '').trim()
}

export type IdentitySnapshot = {
  wechat: boolean
  douyin: boolean
  phone: boolean
  email: boolean
  phoneMasked?: string
  emailMasked?: string
}

export function identitiesFromUser(u: Record<string, unknown>): IdentitySnapshot {
  const phone = phoneFromUserRecord(u) || ''
  const email = bindEmailFromUser(u)
  return {
    wechat: Boolean(wxOpenIdFromUser(u)),
    douyin: Boolean(dyOpenIdFromUser(u)),
    phone: Boolean(phone),
    email: Boolean(email),
    phoneMasked: phone ? maskPhone(phone) : undefined,
    emailMasked: email ? maskEmail(email) : undefined,
  }
}

function adminEnv() {
  return readMerchantSupabaseAdminEnv()
}

function adminHeaders(serviceRole: string): Record<string, string> {
  return {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    'Content-Type': 'application/json',
  }
}

export async function fetchAuthUserById(userId: string): Promise<Record<string, unknown> | null> {
  const { supabaseUrl, serviceRole, missingParts } = adminEnv()
  if (missingParts.length) return null
  const res = await supabaseAdminFetch(
    `${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    { headers: adminHeaders(serviceRole) },
  )
  if (!res.ok) return null
  return (await res.json()) as Record<string, unknown>
}

export async function readAuthUserFromAccessToken(accessToken: string): Promise<Record<string, unknown> | null> {
  const token = String(accessToken || '').trim()
  if (!token) return null
  const { supabaseUrl, serviceRole, missingParts } = adminEnv()
  if (missingParts.length) return null
  const res = await supabaseAdminFetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) return null
  return (await res.json()) as Record<string, unknown>
}

export async function patchUserMetadata(
  userId: string,
  patch: Record<string, unknown>,
  extra?: { phone?: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { supabaseUrl, serviceRole, missingParts } = adminEnv()
  if (missingParts.length) return { ok: false, message: '登录服务未配置' }
  const user = await fetchAuthUserById(userId)
  if (!user) return { ok: false, message: '账号不存在' }
  const prev = (user.user_metadata as Record<string, unknown> | undefined) ?? {}
  const body: Record<string, unknown> = {
    user_metadata: { ...prev, ...patch },
  }
  if (extra?.phone) body.phone = `+86${extra.phone}`
  const res = await supabaseAdminFetch(
    `${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      method: 'PUT',
      headers: adminHeaders(serviceRole),
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) return { ok: false, message: (await res.text()).slice(0, 200) || '更新账号失败' }
  return { ok: true }
}

export async function findAuthUserByBindEmail(
  email: string,
): Promise<{ userId: string; email: string; loginName: string } | null> {
  const needle = normalizeBindEmail(email)
  if (!needle) return null
  const { supabaseUrl, serviceRole, missingParts } = adminEnv()
  if (missingParts.length) return null
  const base = supabaseUrl.replace(/\/$/, '')
  let page = 1
  const perPage = 200
  while (page <= 20) {
    const res = await supabaseAdminFetch(`${base}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      headers: adminHeaders(serviceRole),
    })
    if (!res.ok) return null
    const parsed = (await res.json()) as { users?: Record<string, unknown>[] }
    const users = Array.isArray(parsed.users) ? parsed.users : []
    for (const u of users) {
      if (bindEmailFromUser(u) !== needle) continue
      const userId = typeof u.id === 'string' ? u.id : ''
      const authEmail = typeof u.email === 'string' ? u.email : ''
      const meta = u.user_metadata as { login_name?: string } | undefined
      const loginName =
        (typeof meta?.login_name === 'string' && meta.login_name.trim()) ||
        (authEmail ? authEmail.split('@')[0] ?? '' : '')
      if (userId && authEmail) return { userId, email: authEmail, loginName }
    }
    if (users.length < perPage) break
    page += 1
  }
  return null
}

export async function findAuthUserByErpDyOpenId(
  openid: string,
): Promise<{ userId: string; email: string; loginName: string } | null> {
  const needle = String(openid || '').trim()
  if (!needle) return null
  const { supabaseUrl, serviceRole, missingParts } = adminEnv()
  if (missingParts.length) return null
  const base = supabaseUrl.replace(/\/$/, '')
  let page = 1
  const perPage = 200
  while (page <= 20) {
    const res = await supabaseAdminFetch(`${base}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      headers: adminHeaders(serviceRole),
    })
    if (!res.ok) return null
    const parsed = (await res.json()) as { users?: Record<string, unknown>[] }
    const users = Array.isArray(parsed.users) ? parsed.users : []
    for (const u of users) {
      if (dyOpenIdFromUser(u) !== needle) continue
      const userId = typeof u.id === 'string' ? u.id : ''
      const email = typeof u.email === 'string' ? u.email : ''
      const meta = u.user_metadata as { login_name?: string } | undefined
      const loginName =
        (typeof meta?.login_name === 'string' && meta.login_name.trim()) ||
        (email ? email.split('@')[0] ?? '' : '')
      if (userId && email) return { userId, email, loginName }
    }
    if (users.length < perPage) break
    page += 1
  }
  return null
}

export async function bindErpDyOpenIdToAuthUser(
  userId: string,
  openid: string,
): Promise<{ ok: true } | { ok: false; error: string; message: string }> {
  const id = String(userId || '').trim()
  const dy = String(openid || '').trim()
  if (!id || !dy) return { ok: false, error: 'invalid_bind', message: '绑定参数无效' }
  const existing = await findAuthUserByErpDyOpenId(dy)
  if (existing && existing.userId !== id) {
    return { ok: false, error: 'dy_openid_already_bound', message: '该抖音已绑定其他商家账号' }
  }
  const patched = await patchUserMetadata(id, { [ERP_DY_OPENID_META_KEY]: dy })
  if (!patched.ok) return { ok: false, error: 'bind_failed', message: patched.message }
  return { ok: true }
}

function smtpFromAddress(): string {
  return (
    process.env.MEOO_SMTP_FROM ||
    process.env.MEOO_MAIL_FROM ||
    'lingqi@mofangdianai.com'
  ).trim()
}

function smtpConfigured(): boolean {
  return Boolean(
    (process.env.MEOO_SMTP_HOST || '').trim() &&
      (process.env.MEOO_SMTP_USER || process.env.MEOO_SMTP_FROM || 'lingqi@mofangdianai.com') &&
      (process.env.MEOO_SMTP_PASS || '').trim(),
  )
}

async function smtpCommand(socket: net.Socket, cmd?: string): Promise<string> {
  if (cmd) socket.write(cmd.endsWith('\r\n') ? cmd : `${cmd}\r\n`)
  return await new Promise((resolve, reject) => {
    const onData = (buf: Buffer) => {
      socket.off('error', onErr)
      resolve(buf.toString('utf8'))
    }
    const onErr = (e: Error) => {
      socket.off('data', onData)
      reject(e)
    }
    socket.once('data', onData)
    socket.once('error', onErr)
  })
}

async function sendSmtpMail(to: string, subject: string, text: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const host = (process.env.MEOO_SMTP_HOST || '').trim()
  const port = Number(process.env.MEOO_SMTP_PORT || 465)
  const user = (process.env.MEOO_SMTP_USER || smtpFromAddress()).trim()
  const pass = (process.env.MEOO_SMTP_PASS || '').trim()
  const from = smtpFromAddress()
  if (!host || !pass) return { ok: false, message: '邮箱发信未配置（MEOO_SMTP_HOST / MEOO_SMTP_PASS）' }

  return await new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: host }, async () => {
      try {
        await smtpCommand(socket)
        await smtpCommand(socket, `EHLO mofangdianai.com`)
        await smtpCommand(socket, 'AUTH LOGIN')
        await smtpCommand(socket, Buffer.from(user).toString('base64'))
        const auth = await smtpCommand(socket, Buffer.from(pass).toString('base64'))
        if (!/^2/.test(auth.trim().split('\n').pop() || auth)) {
          socket.end()
          resolve({ ok: false, message: '邮箱发信认证失败' })
          return
        }
        await smtpCommand(socket, `MAIL FROM:<${from}>`)
        await smtpCommand(socket, `RCPT TO:<${to}>`)
        await smtpCommand(socket, 'DATA')
        const payload =
          `From: 灵祺ERP <${from}>\r\nTo: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}\r\n.\r\n`
        await smtpCommand(socket, payload)
        await smtpCommand(socket, 'QUIT')
        socket.end()
        resolve({ ok: true })
      } catch (e) {
        socket.destroy()
        resolve({ ok: false, message: e instanceof Error ? e.message : String(e) })
      }
    })
    socket.setTimeout(20000, () => {
      socket.destroy()
      resolve({ ok: false, message: '邮箱发信超时' })
    })
    socket.on('error', (e) => resolve({ ok: false, message: e.message }))
  })
}

export async function sendAuthEmailCode(emailRaw: string): Promise<
  { ok: true; message: string; devCode?: string } | { ok: false; error: string; message: string }
> {
  const email = normalizeBindEmail(emailRaw)
  if (!email) return { ok: false, error: 'invalid_email', message: '请输入有效邮箱' }
  const code = String(randomInt(100000, 999999))
  emailOtpStore.set(email, { code, exp: Date.now() + EMAIL_OTP_TTL_MS })
  const text = `您的灵祺ERP验证码是 ${code}，5 分钟内有效。如非本人操作请忽略。`
  if (smtpConfigured()) {
    const sent = await sendSmtpMail(email, '灵祺ERP邮箱验证码', text)
    if (!sent.ok) return { ok: false, error: 'email_send_failed', message: sent.message }
    const expose = process.env.MEOO_SMS_DEV_EXPOSE === '1' || process.env.VERCEL_ENV !== 'production'
    return { ok: true, message: `验证码已发送至 ${maskEmail(email)}`, ...(expose ? { devCode: code } : {}) }
  }
  const expose = process.env.MEOO_SMS_DEV_EXPOSE === '1' || process.env.NODE_ENV !== 'production'
  if (!expose) {
    return { ok: false, error: 'email_not_configured', message: '邮箱发信未配置，请联系管理员设置 MEOO_SMTP_*' }
  }
  return { ok: true, message: `开发环境验证码已生成（发件箱 ${smtpFromAddress()}）`, devCode: code }
}

export function verifyAuthEmailCode(emailRaw: string, code: string): boolean {
  const email = normalizeBindEmail(emailRaw)
  if (!email) return false
  const row = emailOtpStore.get(email)
  if (row && Date.now() <= row.exp && row.code === String(code || '').trim()) {
    emailOtpStore.delete(email)
    return true
  }
  return verifySmsCode(`email:${email}`, String(code || '').trim())
}

function issueMergeToken(input: {
  fromUserId: string
  targetUserId: string
  channel: 'phone' | 'email'
  value: string
}): string {
  const token = randomBytes(18).toString('base64url')
  mergeStore.set(token, { ...input, exp: Date.now() + MERGE_TTL_MS })
  return token
}

export type BindContactResult =
  | { ok: true; merged: false; identities: IdentitySnapshot }
  | {
      ok: false
      error: 'account_exists_merge'
      message: string
      mergeToken: string
      channel: 'phone' | 'email'
      masked: string
      loginName: string
    }
  | { ok: false; error: string; message: string }

export async function bindContactToCurrentUser(input: {
  userId: string
  phone?: string
  email?: string
  smsCode?: string
  emailCode?: string
}): Promise<BindContactResult> {
  const user = await fetchAuthUserById(input.userId)
  if (!user) return { ok: false, error: 'account_not_found', message: '账号不存在' }
  const phone = normalizeCnMobile(input.phone ?? '')
  const email = normalizeBindEmail(input.email ?? '')

  if (phone) {
    if (!(await verifyAuthSmsCode(phone, String(input.smsCode || '').trim()))) {
      return { ok: false, error: 'sms_code_invalid', message: '手机验证码错误或已过期' }
    }
    const holder = await findAuthUserByPhone(phone)
    if (holder && holder.userId !== input.userId) {
      const token = issueMergeToken({
        fromUserId: input.userId,
        targetUserId: holder.userId,
        channel: 'phone',
        value: phone,
      })
      return {
        ok: false,
        error: 'account_exists_merge',
        message: `已有该账号（${holder.loginName} / ${maskPhone(phone)}），是否确定合并？需再次验证手机号。`,
        mergeToken: token,
        channel: 'phone',
        masked: maskPhone(phone),
        loginName: holder.loginName,
      }
    }
    const patched = await patchUserMetadata(input.userId, { phone }, { phone })
    if (!patched.ok) return { ok: false, error: 'bind_failed', message: patched.message }
  } else if (email) {
    if (!verifyAuthEmailCode(email, String(input.emailCode || ''))) {
      return { ok: false, error: 'email_code_invalid', message: '邮箱验证码错误或已过期' }
    }
    const holder = await findAuthUserByBindEmail(email)
    if (holder && holder.userId !== input.userId) {
      const token = issueMergeToken({
        fromUserId: input.userId,
        targetUserId: holder.userId,
        channel: 'email',
        value: email,
      })
      return {
        ok: false,
        error: 'account_exists_merge',
        message: `已有该账号（${holder.loginName} / ${maskEmail(email)}），是否确定合并？需再次验证邮箱。`,
        mergeToken: token,
        channel: 'email',
        masked: maskEmail(email),
        loginName: holder.loginName,
      }
    }
    const patched = await patchUserMetadata(input.userId, { [ERP_BIND_EMAIL_META_KEY]: email })
    if (!patched.ok) return { ok: false, error: 'bind_failed', message: patched.message }
  } else {
    return { ok: false, error: 'invalid_contact', message: '请填写手机号或邮箱' }
  }

  const next = (await fetchAuthUserById(input.userId)) || user
  return { ok: true, merged: false, identities: identitiesFromUser(next) }
}

export async function confirmAccountMerge(input: {
  mergeToken: string
  smsCode?: string
  emailCode?: string
}): Promise<
  | {
      ok: true
      merged: true
      access_token: string
      refresh_token: string
      expires_in?: number
      loginName: string
      identities: IdentitySnapshot
    }
  | { ok: false; error: string; message: string }
> {
  const row = mergeStore.get(String(input.mergeToken || '').trim())
  if (!row || Date.now() > row.exp) {
    return { ok: false, error: 'merge_expired', message: '合并确认已过期，请重新绑定' }
  }
  if (row.channel === 'phone') {
    if (!(await verifyAuthSmsCode(row.value, String(input.smsCode || '').trim()))) {
      return { ok: false, error: 'sms_code_invalid', message: '手机验证码错误或已过期' }
    }
  } else if (!verifyAuthEmailCode(row.value, String(input.emailCode || ''))) {
    return { ok: false, error: 'email_code_invalid', message: '邮箱验证码错误或已过期' }
  }

  const from = await fetchAuthUserById(row.fromUserId)
  const target = await fetchAuthUserById(row.targetUserId)
  if (!from || !target) return { ok: false, error: 'account_not_found', message: '待合并账号不存在' }

  const wx = wxOpenIdFromUser(from)
  const dy = dyOpenIdFromUser(from)
  const fromEmail = bindEmailFromUser(from)
  const fromPhone = phoneFromUserRecord(from) || ''
  const patch: Record<string, unknown> = { merged_from: row.fromUserId }
  if (wx && !wxOpenIdFromUser(target)) patch[ERP_WX_OPENID_META_KEY] = wx
  if (dy && !dyOpenIdFromUser(target)) patch[ERP_DY_OPENID_META_KEY] = dy
  if (fromEmail && !bindEmailFromUser(target)) patch[ERP_BIND_EMAIL_META_KEY] = fromEmail
  if (row.channel === 'phone') patch.phone = row.value
  else if (fromPhone && !phoneFromUserRecord(target)) patch.phone = fromPhone

  const extraPhone = phoneFromUserRecord(target) || (row.channel === 'phone' ? row.value : fromPhone) || undefined
  const patched = await patchUserMetadata(row.targetUserId, patch, extraPhone ? { phone: extraPhone } : undefined)
  if (!patched.ok) return { ok: false, error: 'merge_failed', message: patched.message }

  await patchUserMetadata(row.fromUserId, { merged_into: row.targetUserId, merged_at: new Date().toISOString() })

  mergeStore.delete(String(input.mergeToken || '').trim())
  const targetEmail = typeof target.email === 'string' ? target.email : ''
  const meta = target.user_metadata as { login_name?: string } | undefined
  const loginName = (typeof meta?.login_name === 'string' && meta.login_name.trim()) || targetEmail.split('@')[0] || ''
  const session = await createAdminSessionForUserId(row.targetUserId, targetEmail)
  if (!session.ok) {
    return { ok: false, error: session.error, message: '合并成功但登录失败，请用原账号登录' }
  }
  const next = (await fetchAuthUserById(row.targetUserId)) || target
  return {
    ok: true,
    merged: true,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    loginName,
    identities: identitiesFromUser(next),
  }
}

export function needsPhoneBindFromUser(u: Record<string, unknown> | null): boolean {
  if (!u) return true
  return !userHasPhone(u)
}

export function loginNameFromUser(u: Record<string, unknown>): string {
  const meta = u.user_metadata as { login_name?: string } | undefined
  const fromMeta = typeof meta?.login_name === 'string' ? meta.login_name.trim() : ''
  if (fromMeta) return fromMeta
  const email = typeof u.email === 'string' ? u.email : ''
  return email ? email.split('@')[0] ?? '' : ''
}

function loginNameFromDyOpenId(openid: string): string {
  const clean = openid.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  const tail = (clean || 'user').slice(-10)
  return `dy${tail}`.slice(0, 32)
}

export async function signInOrProvisionByDyOpenId(input: {
  openid: string
  nickName?: string
}): Promise<
  | {
      ok: true
      access_token: string
      refresh_token: string
      loginName: string
      isNew: boolean
      needsPhoneBind: boolean
    }
  | { ok: false; error: string; message: string }
> {
  const openid = String(input.openid || '').trim()
  if (!openid) return { ok: false, error: 'invalid_dy_openid', message: '抖音授权无效' }
  let user = await findAuthUserByErpDyOpenId(openid)
  let isNew = false
  if (!user) {
    let loginName = loginNameFromDyOpenId(openid)
    const merchantName = String(input.nickName || '').trim() || '抖音商家'
    const password = randomBytes(12).toString('base64url')
    let provisioned: Awaited<ReturnType<typeof provisionMerchantTenant>> | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      provisioned = await provisionMerchantTenant({
        loginName,
        password,
        merchantName,
        trialDays: 7,
        edition: 'merchant',
      })
      if (provisioned.ok) break
      if (provisioned.error !== 'login_exists') {
        return { ok: false, error: provisioned.error, message: '抖音注册失败，请稍后重试' }
      }
      loginName = `${loginNameFromDyOpenId(openid)}${attempt + 2}`.slice(0, 32)
    }
    if (!provisioned?.ok) return { ok: false, error: 'login_exists', message: '抖音注册失败' }
    const bind = await bindErpDyOpenIdToAuthUser(provisioned.userId, openid)
    if (!bind.ok) return { ok: false, error: bind.error, message: bind.message }
    user = { userId: provisioned.userId, email: provisioned.email, loginName }
    isNew = true
  } else {
    await bindErpDyOpenIdToAuthUser(user.userId, openid)
  }
  const session = await createAdminSessionForUserId(user.userId, user.email)
  if (!session.ok) return { ok: false, error: session.error, message: '登录失败，请稍后重试' }
  const full = await fetchAuthUserById(user.userId)
  return {
    ok: true,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    loginName: user.loginName,
    isNew,
    needsPhoneBind: needsPhoneBindFromUser(full),
  }
}
