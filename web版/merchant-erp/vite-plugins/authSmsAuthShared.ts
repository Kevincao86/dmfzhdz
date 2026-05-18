import { aliyunSmsConfigured, checkAliyunSmsVerifyCode, sendAliyunSmsVerifyCode } from './aliyunDypnsSms.js'
import { dispatchSms, issueSmsCode, normalizeCnMobile, verifySmsCode } from './authRegistrationOtp.js'
import { readMerchantSupabaseAdminEnv } from './merchantSupabaseAdminEnv.js'

export type AuthSmsSendResult =
  | { ok: true; message: string; devCode?: string }
  | { ok: false; error: string; message?: string }

export async function sendAuthSmsCode(phone: string, viteRoot?: string): Promise<AuthSmsSendResult> {
  if (aliyunSmsConfigured()) {
    const r = await sendAliyunSmsVerifyCode(phone)
    if (!r.ok) {
      return { ok: false, error: 'aliyun_sms_send_failed', message: r.message }
    }
    return { ok: true, message: '验证码已发送' }
  }

  const { code } = issueSmsCode(phone, viteRoot)
  const sms = await dispatchSms(phone, code)
  if (!sms.sent && !sms.devExpose) {
    return { ok: false, error: 'sms_not_configured', message: '短信服务未配置' }
  }
  return {
    ok: true,
    message: '验证码已发送',
    ...(sms.devExpose ? { devCode: sms.devExpose } : {}),
  }
}

export async function verifyAuthSmsCode(phone: string, code: string, viteRoot?: string): Promise<boolean> {
  if (aliyunSmsConfigured()) {
    const r = await checkAliyunSmsVerifyCode(phone, code)
    return r.ok
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
    const res = await fetch(`${base}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, { headers })
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
  const headers: Record<string, string> = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    'Content-Type': 'application/json',
  }

  const linkRes = await fetch(`${base}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'magiclink', email }),
  })
  const linkText = await linkRes.text()
  if (!linkRes.ok) {
    return { ok: false, error: 'magiclink_failed', detail: linkText.slice(0, 400) }
  }

  let linkJson: {
    properties?: { hashed_token?: string }
    user?: { id?: string }
  } = {}
  try {
    linkJson = JSON.parse(linkText) as typeof linkJson
  } catch {
    return { ok: false, error: 'magiclink_parse_failed', detail: linkText.slice(0, 200) }
  }

  if (linkJson.user?.id && linkJson.user.id !== userId) {
    return { ok: false, error: 'user_mismatch', detail: 'generate_link user id mismatch' }
  }

  const tokenHash = linkJson.properties?.hashed_token
  if (!tokenHash) {
    return { ok: false, error: 'magiclink_no_token', detail: linkText.slice(0, 200) }
  }

  const verifyRes = await fetch(`${base}/auth/v1/verify`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'email', token_hash: tokenHash }),
  })
  const verifyText = await verifyRes.text()
  if (!verifyRes.ok) {
    return { ok: false, error: 'verify_failed', detail: verifyText.slice(0, 400) }
  }

  let verifyJson: {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    session?: { access_token?: string; refresh_token?: string; expires_in?: number }
  } = {}
  try {
    verifyJson = JSON.parse(verifyText) as typeof verifyJson
  } catch {
    return { ok: false, error: 'verify_parse_failed', detail: verifyText.slice(0, 200) }
  }

  const access_token = verifyJson.access_token ?? verifyJson.session?.access_token
  const refresh_token = verifyJson.refresh_token ?? verifyJson.session?.refresh_token
  if (!access_token || !refresh_token) {
    return { ok: false, error: 'session_missing', detail: verifyText.slice(0, 200) }
  }

  return {
    ok: true,
    access_token,
    refresh_token,
    expires_in: verifyJson.expires_in ?? verifyJson.session?.expires_in ?? 3600,
  }
}
