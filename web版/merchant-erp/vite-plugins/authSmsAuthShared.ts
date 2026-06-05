import { aliyunSmsConfigured, checkAliyunSmsVerifyCode, sendAliyunSmsVerifyCode } from './aliyunDypnsSms.js'
import { dispatchSms, issueSmsCode, normalizeCnMobile, verifySmsCode } from './authRegistrationOtp.js'

const OTP_TTL_MS = 5 * 60 * 1000
/** 验证码经公网/阿里云发出时，禁止回落到本机 OTP 文件（避免 sms_code_invalid） */
const remoteSmsSentUntil = new Map<string, number>()

function markRemoteSmsSent(phone: string) {
  remoteSmsSentUntil.set(phone, Date.now() + OTP_TTL_MS)
}

function wasRemoteSmsSent(phone: string): boolean {
  const exp = remoteSmsSentUntil.get(phone)
  if (!exp) return false
  if (Date.now() > exp) {
    remoteSmsSentUntil.delete(phone)
    return false
  }
  return true
}

function verifyUrlForBase(base: string): string {
  return base.includes('/erp-api')
    ? `${base.replace(/\/$/, '')}/meoo-auth-sms-verify`
    : `${base.replace(/\/$/, '')}/api/meoo-auth-sms-verify`
}
import { readMerchantSupabaseAdminEnv, readMerchantSupabaseAnonKey } from './merchantSupabaseAdminEnv.js'

export type AuthSmsSendResult =
  | { ok: true; message: string; devCode?: string }
  | { ok: false; error: string; message?: string }

function authSmsPublicBases(): string[] {
  const raw = [
    process.env.MEOO_AUTH_SMS_PUBLIC_BASE,
    process.env.MEOO_AUTH_VERIFY_PUBLIC_BASE,
    process.env.MEOO_AUTH_API_PUBLIC_BASE,
    'https://cs.mofangdianai.com',
    'https://mofangdianai.com',
  ]
  const bases: string[] = []
  for (const item of raw) {
    const b = String(item ?? '')
      .trim()
      .replace(/\/$/, '')
    if (b && !bases.includes(b)) bases.push(b)
  }
  return bases
}

/** ECS / 无 Aliyun 密钥时：委托已配置阿里云的环境（通常为 Vercel 商家站）发真实短信 */
async function sendAuthSmsViaPublicApi(phone: string): Promise<AuthSmsSendResult | null> {
  const secret = (process.env.MEOO_AUTH_INTERNAL_SECRET ?? '').trim()
  for (const base of authSmsPublicBases()) {
    try {
      const res = await fetch(`${base}/api/meoo-auth-sms-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { 'X-Meoo-Internal-Auth': secret } : {}),
        },
        body: JSON.stringify({ phone }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        message?: string
        error?: string
      }
      if (res.ok && j.ok !== false) {
        markRemoteSmsSent(phone)
        return { ok: true, message: j.message ?? '验证码已发送' }
      }
      if (!res.ok) {
        return {
          ok: false,
          error: String(j.error ?? `http_${res.status}`),
          message: j.message ?? '验证码发送失败',
        }
      }
    } catch {
      /* try next base */
    }
  }
  return null
}

export async function sendAuthSmsCode(phone: string, viteRoot?: string): Promise<AuthSmsSendResult> {
  if (aliyunSmsConfigured()) {
    const r = await sendAliyunSmsVerifyCode(phone)
    if (!r.ok) {
      return { ok: false, error: 'aliyun_sms_send_failed', message: r.message }
    }
    markRemoteSmsSent(phone)
    return { ok: true, message: '验证码已发送' }
  }

  if (!viteRoot) {
    const remote = await sendAuthSmsViaPublicApi(phone)
    if (remote) return remote
  }

  const { code } = issueSmsCode(phone, viteRoot)
  const sms = await dispatchSms(phone, code, !!viteRoot)
  if (!sms.sent && !sms.devExpose) {
    return { ok: false, error: 'sms_not_configured', message: '短信服务未配置，请联系管理员配置阿里云短信' }
  }
  return {
    ok: true,
    message: '验证码已发送',
    ...(sms.devExpose ? { devCode: sms.devExpose } : {}),
  }
}

/** Vercel 商家站（配阿里云密钥）；ECS /erp-api 与根域 /api 通常无密钥，不可采信其 false */
function isAliyunSmsVerifyHost(base: string): boolean {
  return /cs\.mofangdianai\.com/i.test(base.replace(/\/$/, ''))
}

function isErpApiPublicBase(base: string): boolean {
  const b = base.replace(/\/$/, '')
  return /\/erp-api$/i.test(b) || /^https?:\/\/mofangdianai\.com$/i.test(b)
}

function authVerifyPublicBases(): string[] {
  const raw = [
    process.env.MEOO_AUTH_VERIFY_PUBLIC_BASE,
    process.env.MEOO_AUTH_API_PUBLIC_BASE,
    // 与 sendAuthSms 一致：先 Vercel（阿里云发码同服核验），再 ECS
    'https://cs.mofangdianai.com',
    'https://mofangdianai.com',
    process.env.MEOO_ERP_PUBLIC_BASE,
    'https://mofangdianai.com/erp-api',
  ]
  const bases: string[] = []
  for (const item of raw) {
    const b = String(item ?? '')
      .trim()
      .replace(/\/$/, '')
    if (b && !bases.includes(b)) bases.push(b)
  }
  return bases
}

async function postSmsVerify(
  url: string,
  phone: string,
  code: string,
  withSecret: boolean,
): Promise<{ ok?: boolean } | null> {
  const secret = (process.env.MEOO_AUTH_INTERNAL_SECRET ?? '').trim()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(withSecret && secret ? { 'X-Meoo-Internal-Auth': secret } : {}),
      },
      body: JSON.stringify({ phone, smsCode: code }),
    })
    if (res.status === 403 && withSecret && secret) {
      return postSmsVerify(url, phone, code, false)
    }
    if (!res.ok) return null
    return (await res.json().catch(() => ({}))) as { ok?: boolean }
  } catch {
    return null
  }
}

/** ECS 注册/登录核验：本机未配 Aliyun 时，委托公网 verify 端点（验证码由 Aliyun 托管，与发送端同服即可） */
async function verifyAuthSmsCodeViaPublicApi(phone: string, code: string): Promise<boolean | null> {
  const secret = (process.env.MEOO_AUTH_INTERNAL_SECRET ?? '').trim()
  for (const base of authVerifyPublicBases()) {
    const url = verifyUrlForBase(base)
    const j = await postSmsVerify(url, phone, code, !!secret)
    if (!j) continue
    if (j.ok === true) return true
    if (j.ok === false) {
      // ECS 无阿里云时会误报 false；仅采信 Vercel 节点，其余继续尝试
      if (isAliyunSmsVerifyHost(base) || !isErpApiPublicBase(base)) return false
      continue
    }
  }
  return null
}

export type VerifyAuthSmsOptions = { skipRemoteFallback?: boolean }

export async function verifyAuthSmsCode(
  phone: string,
  code: string,
  viteRoot?: string,
  opts?: VerifyAuthSmsOptions,
): Promise<boolean> {
  if (aliyunSmsConfigured()) {
    const r = await checkAliyunSmsVerifyCode(phone, code)
    return r.ok
  }
  if (!opts?.skipRemoteFallback) {
    const remote = await verifyAuthSmsCodeViaPublicApi(phone, code)
    if (remote === true) return true
    if (remote === false) return false
    if (wasRemoteSmsSent(phone)) return false
  }
  return verifySmsCode(phone, code, viteRoot)
}

function phoneFromUserRecord(u: Record<string, unknown>): string | null {
  const meta = u.user_metadata as { phone?: string } | undefined
  const fromMeta = normalizeCnMobile(meta?.phone ?? '')
  if (fromMeta) return fromMeta
  const rawPhone = typeof u.phone === 'string' ? u.phone : ''
  const digits = rawPhone.replace(/\D/g, '')
  if (digits.startsWith('86') && digits.length === 13) {
    return normalizeCnMobile(digits.slice(2))
  }
  return normalizeCnMobile(digits)
}

export async function findAuthUserByPhone(
  phone: string,
): Promise<{ userId: string; email: string; loginName: string } | null> {
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
    let res: Response
    try {
      res = await fetch(`${base}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, { headers })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`无法连接认证服务 ${base}：${msg}`)
    }
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
      if (phoneFromUserRecord(u) !== phone) continue
      const userId = typeof u.id === 'string' ? u.id : ''
      const email = typeof u.email === 'string' ? u.email : ''
      const meta = u.user_metadata as { login_name?: string } | undefined
      const loginName =
        (typeof meta?.login_name === 'string' && meta.login_name.trim()) ||
        (email ? email.split('@')[0] ?? '' : '')
      if (userId && email) {
        return { userId, email, loginName }
      }
    }
    if (users.length < perPage) break
    page += 1
  }
  return null
}

export async function phoneAlreadyRegistered(phone: string): Promise<boolean> {
  const hit = await findAuthUserByPhone(phone)
  return hit !== null
}

type GenerateLinkProps = {
  hashed_token?: string
  action_link?: string
  email_otp?: string
  verification_type?: string
}

function readGenerateLinkProps(linkJson: Record<string, unknown>): GenerateLinkProps {
  const props = linkJson.properties as GenerateLinkProps | undefined
  return {
    hashed_token:
      (typeof props?.hashed_token === 'string' && props.hashed_token.trim()) ||
      (typeof linkJson.hashed_token === 'string' && linkJson.hashed_token.trim()) ||
      undefined,
    action_link:
      (typeof props?.action_link === 'string' && props.action_link) ||
      (typeof linkJson.action_link === 'string' && linkJson.action_link) ||
      undefined,
    email_otp:
      (typeof props?.email_otp === 'string' && props.email_otp.trim()) ||
      (typeof linkJson.email_otp === 'string' && linkJson.email_otp.trim()) ||
      undefined,
    verification_type:
      (typeof props?.verification_type === 'string' && props.verification_type.trim()) ||
      (typeof linkJson.verification_type === 'string' && linkJson.verification_type.trim()) ||
      undefined,
  }
}

function extractHashedTokenFromGenerateLink(
  linkJson: Record<string, unknown>,
  linkText: string,
): string | null {
  const parsed = readGenerateLinkProps(linkJson)
  if (parsed.hashed_token) return parsed.hashed_token
  const actionLink = parsed.action_link ?? ''
  if (actionLink) {
    try {
      const u = new URL(actionLink)
      const fromQuery =
        u.searchParams.get('token_hash') ||
        u.searchParams.get('token') ||
        u.hash.match(/token_hash=([^&]+)/)?.[1] ||
        u.hash.match(/token=([^&]+)/)?.[1]
      if (fromQuery?.trim()) return decodeURIComponent(fromQuery.trim())
    } catch {
      /* ignore */
    }
  }
  const m = linkText.match(/"hashed_token"\s*:\s*"([^"]+)"/)
  return m?.[1]?.trim() || null
}

function parseSessionFromVerifyBody(verifyText: string): {
  access_token?: string
  refresh_token?: string
  expires_in?: number
} | null {
  try {
    const verifyJson = JSON.parse(verifyText) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      session?: { access_token?: string; refresh_token?: string; expires_in?: number }
    }
    const access_token = verifyJson.access_token ?? verifyJson.session?.access_token
    const refresh_token = verifyJson.refresh_token ?? verifyJson.session?.refresh_token
    if (!access_token || !refresh_token) return null
    return {
      access_token,
      refresh_token,
      expires_in: verifyJson.expires_in ?? verifyJson.session?.expires_in ?? 3600,
    }
  } catch {
    return null
  }
}

export async function createAdminSessionForUserId(
  userId: string,
  email: string,
): Promise<
  | { ok: true; access_token: string; refresh_token: string; expires_in: number }
  | { ok: false; error: string; detail?: string }
> {
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) {
    return { ok: false, error: 'supabase_admin_not_configured', detail: missingParts.join(',') }
  }

  const base = supabaseUrl.replace(/\/$/, '')
  const adminHeaders: Record<string, string> = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    'Content-Type': 'application/json',
  }
  const anonKey = readMerchantSupabaseAnonKey()
  const verifyApiKey = anonKey || serviceRole

  const linkRes = await fetch(`${base}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ type: 'magiclink', email }),
  })
  const linkText = await linkRes.text()
  if (!linkRes.ok) {
    return { ok: false, error: 'magiclink_failed', detail: linkText.slice(0, 400) }
  }

  let linkJson: Record<string, unknown> = {}
  try {
    linkJson = JSON.parse(linkText) as Record<string, unknown>
  } catch {
    return { ok: false, error: 'magiclink_parse_failed', detail: linkText.slice(0, 200) }
  }

  const linkUser = linkJson.user as { id?: string } | undefined
  if (linkUser?.id && linkUser.id !== userId) {
    return { ok: false, error: 'user_mismatch', detail: 'generate_link user id mismatch' }
  }

  const linkProps = readGenerateLinkProps(linkJson)
  const tokenHash = extractHashedTokenFromGenerateLink(linkJson, linkText)

  const verifyHeaders: Record<string, string> = {
    apikey: verifyApiKey,
    Authorization: `Bearer ${verifyApiKey}`,
    'Content-Type': 'application/json',
  }

  const postVerify = async (
    body: Record<string, string>,
  ): Promise<
    | { ok: true; access_token: string; refresh_token: string; expires_in: number }
    | { ok: false; detail: string }
  > => {
    const verifyRes = await fetch(`${base}/auth/v1/verify`, {
      method: 'POST',
      headers: verifyHeaders,
      body: JSON.stringify(body),
    })
    const verifyText = await verifyRes.text()
    if (!verifyRes.ok) {
      return { ok: false, detail: verifyText.slice(0, 400) }
    }
    const session = parseSessionFromVerifyBody(verifyText)
    if (session?.access_token && session.refresh_token) {
      return {
        ok: true,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in ?? 3600,
      }
    }
    return { ok: false, detail: verifyText.slice(0, 200) || 'verify returned no session' }
  }

  let lastDetail = ''

  if (tokenHash) {
    const verifyType =
      linkProps.verification_type === 'signup' ||
      linkProps.verification_type === 'invite' ||
      linkProps.verification_type === 'recovery' ||
      linkProps.verification_type === 'magiclink' ||
      linkProps.verification_type === 'email_change'
        ? linkProps.verification_type
        : 'magiclink'
    const hashResult = await postVerify({ type: verifyType, token_hash: tokenHash })
    if (hashResult.ok) return hashResult
    lastDetail = hashResult.detail
  }

  if (linkProps.email_otp) {
    const otpResult = await postVerify({ type: 'email', email, token: linkProps.email_otp })
    if (otpResult.ok) return otpResult
    lastDetail = otpResult.detail
  }

  if (!tokenHash && !linkProps.email_otp) {
    return { ok: false, error: 'magiclink_no_token', detail: linkText.slice(0, 200) }
  }

  return { ok: false, error: 'verify_failed', detail: lastDetail || 'verify returned no session' }
}

export function smsLoginErrorMessage(error: string, _detail?: string): string {
  if (error === 'supabase_admin_not_configured') {
    return '登录服务未配置完成，请联系管理员在 Vercel 配置 SUPABASE_SERVICE_ROLE_KEY 后重新部署'
  }
  if (error === 'supabase_not_configured') {
    return '登录服务未配置，请联系管理员在 Vercel 配置 Supabase URL 与 anon key 后重新部署'
  }
  if (error === 'phone_not_registered') {
    return '该手机号尚未注册，请先注册'
  }
  if (error === 'sms_code_invalid') {
    return '验证码错误或已过期'
  }
  if (error === 'invalid_credentials') {
    return '账号或密码错误'
  }
  if (error === 'magiclink_failed' || error === 'verify_failed' || error === 'session_missing') {
    return '登录服务暂不可用，请稍后重试'
  }
  return '登录失败，请稍后重试'
}

function tenantEmailDomain(): string {
  return (
    process.env.VITE_SUPABASE_TENANT_EMAIL_DOMAIN ??
    process.env.TENANT_EMAIL_DOMAIN ??
    'users.meoo.test'
  ).trim()
}

export function loginNameToTenantEmail(loginName: string): string {
  const domain = tenantEmailDomain()
  const slug = String(loginName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${slug || 'user'}@${domain}`
}

export type PasswordLoginResult =
  | {
      ok: true
      access_token: string
      refresh_token: string
      expires_in?: number
      loginName: string
    }
  | { ok: false; error: string; message: string; detail?: string }

/** 账户名 + 密码 → Supabase session（供小程序经 ERP 网关调用） */
export async function signInWithPasswordLoginName(
  loginName: string,
  password: string,
): Promise<PasswordLoginResult> {
  const name = String(loginName || '').trim()
  if (name.length < 2) {
    return { ok: false, error: 'invalid_login_name', message: '账户名至少 2 个字符' }
  }
  if (String(password || '').length < 6) {
    return { ok: false, error: 'invalid_password', message: '密码至少 6 位' }
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '')
    .trim()
    .replace(/\/$/, '')
  const anonKey = readMerchantSupabaseAnonKey()
  if (!supabaseUrl || !anonKey) {
    return { ok: false, error: 'supabase_not_configured', message: smsLoginErrorMessage('supabase_not_configured') }
  }

  const email = loginNameToTenantEmail(name)
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ email, password }),
  })

  let data: Record<string, unknown> = {}
  try {
    data = (await res.json()) as Record<string, unknown>
  } catch {
    data = {}
  }

  if (res.ok && typeof data.access_token === 'string' && data.access_token) {
    return {
      ok: true,
      access_token: data.access_token,
      refresh_token: typeof data.refresh_token === 'string' ? data.refresh_token : '',
      expires_in: typeof data.expires_in === 'number' ? data.expires_in : undefined,
      loginName: name,
    }
  }

  const rawMsg =
    (typeof data.error_description === 'string' && data.error_description) ||
    (typeof data.msg === 'string' && data.msg) ||
    (typeof data.message === 'string' && data.message) ||
    '账号或密码错误'
  const invalid =
    res.status === 400 ||
    data.error_code === 'invalid_credentials' ||
    /invalid login/i.test(String(rawMsg))
  return {
    ok: false,
    error: invalid ? 'invalid_credentials' : 'password_login_failed',
    message: invalid ? '账号或密码错误' : String(rawMsg),
  }
}
