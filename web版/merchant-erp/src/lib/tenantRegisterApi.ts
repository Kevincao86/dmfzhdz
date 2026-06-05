import { merchantErpApiCandidates } from './merchantErpApiBase'
import { toUserFacingError } from './userFacingError'

export type SmsSendResult = {
  ok: boolean
  message?: string
  devCode?: string
  error?: string
}

export type RegisterResult = {
  ok: boolean
  message?: string
  error?: string
  detail?: string
}

export type SmsLoginResult = {
  ok: boolean
  message?: string
  error?: string
  detail?: string
  access_token?: string
  refresh_token?: string
  expires_in?: number
  loginName?: string
}


/** 注册/登录：与智能体一致，生产优先 ECS /erp-api（Vercel 连不上自建 Supabase） */
function erpAuthApiCandidates(path: string): string[] {
  return merchantErpApiCandidates(path)
}

async function postAuthJson<T extends Record<string, unknown>>(
  path: string,
  body: unknown,
  action: string,
  retryStatuses: number[] = [],
  opts?: { preferSameOrigin?: boolean },
): Promise<{ res: Response; json: T } | { ok: false; error: string; message: string }> {
  let candidates = erpAuthApiCandidates(path)
  if (opts?.preferSameOrigin && typeof window !== 'undefined') {
    const origin = window.location.origin
    candidates = [
      ...candidates.filter((u) => u.startsWith(origin)),
      ...candidates.filter((u) => !u.startsWith(origin)),
    ]
  }
  let lastMessage = `${action}失败，请稍后重试。`

  for (let i = 0; i < candidates.length; i += 1) {
    const url = candidates[i]!
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => ({}))) as T
      if (!res.ok && retryStatuses.includes(res.status) && i < candidates.length - 1) {
        lastMessage =
          (typeof json === 'object' && json && 'message' in json && String(json.message)) ||
          lastMessage
        continue
      }
      return { res, json }
    } catch (e) {
      lastMessage = toUserFacingError(e, action)
      if (i < candidates.length - 1) continue
    }
  }

  return { ok: false, error: 'network_error', message: lastMessage }
}

export async function sendAuthSms(phone: string): Promise<SmsSendResult> {
  // 短信发送：优先同源 Vercel（阿里云密钥），再 ECS erp-api；避免 ECS 无密钥时返回开发验证码
  const posted = await postAuthJson<SmsSendResult & { message?: string; detail?: string; devCode?: string }>(
    '/api/meoo-auth-sms-send',
    { phone },
    '发送验证码',
    [502, 503, 504],
    { preferSameOrigin: true },
  )
  if (!('res' in posted)) {
    return posted
  }
  const { res, json: j } = posted
  if (!res.ok) {
    return {
      ok: false,
      error: j.error ?? `http_${res.status}`,
      message: j.message ?? j.detail,
    }
  }
  return { ok: j.ok !== false, message: j.message, devCode: j.devCode }
}

/** @deprecated 使用 sendAuthSms */
export const sendRegistrationSms = sendAuthSms

export async function registerMerchantAccount(body: {
  loginName: string
  merchantName: string
  phone: string
  smsCode: string
  password: string
  confirmPassword: string
}): Promise<RegisterResult> {
  const posted = await postAuthJson<RegisterResult & { message?: string; detail?: string }>(
    '/api/meoo-auth-register',
    body,
    '注册',
    [502, 503, 504],
    { preferSameOrigin: true },
  )
  if (!('res' in posted)) {
    return posted
  }
  const { res, json: j } = posted
  if (!res.ok) {
    return {
      ok: false,
      error: j.error ?? `http_${res.status}`,
      message: j.message ?? j.detail ?? (res.status === 500 ? '服务器内部错误' : undefined),
      detail: j.detail,
    }
  }
  return { ok: j.ok !== false, message: j.message }
}

export async function registerPartnerAccount(body: {
  loginName: string
  partnerName: string
  phone: string
  smsCode: string
  password: string
  confirmPassword: string
}): Promise<RegisterResult> {
  const posted = await postAuthJson<RegisterResult & { message?: string; detail?: string }>(
    '/api/meoo-auth-register-partner',
    {
      loginName: body.loginName,
      partnerName: body.partnerName,
      phone: body.phone,
      smsCode: body.smsCode,
      password: body.password,
      confirmPassword: body.confirmPassword,
    },
    '注册',
    [502, 503, 504],
    { preferSameOrigin: true },
  )
  if (!('res' in posted)) {
    return posted
  }
  const { res, json: j } = posted
  if (!res.ok) {
    return {
      ok: false,
      error: j.error ?? `http_${res.status}`,
      message: j.message ?? j.detail,
      detail: j.detail,
    }
  }
  return { ok: j.ok !== false, message: j.message }
}

export async function loginWithSmsCode(body: {
  phone: string
  smsCode: string
}): Promise<SmsLoginResult> {
  const posted = await postAuthJson<SmsLoginResult & { message?: string; detail?: string }>(
    '/api/meoo-auth-sms-login',
    body,
    '登录',
    [502, 503, 504],
    { preferSameOrigin: true },
  )
  if (!('res' in posted)) {
    return posted
  }
  const { res, json: j } = posted
  if (!res.ok) {
    return {
      ok: false,
      error: j.error ?? `http_${res.status}`,
      message: j.message,
      detail: j.detail,
    }
  }
  return {
    ok: j.ok !== false,
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_in: j.expires_in,
    loginName: j.loginName,
    message: j.message,
  }
}

export function isLoginNameValid(loginName: string): boolean {
  return /^[a-zA-Z0-9]{4,32}$/.test(loginName.trim())
}

export function isMerchantShortNameValid(name: string): boolean {
  const t = name.trim()
  if (t.length < 2 || t.length > 30) return false
  return /^[\u4e00-\u9fa5a-zA-Z0-9·（）()\-—\s]+$/.test(t)
}

export function isCnMobileValid(phone: string): boolean {
  return /^1\d{10}$/.test(String(phone || '').replace(/\D/g, ''))
}

/** @internal 供单测或排障 */
export function resolveErpAuthApiUrl(path: string): string {
  return erpAuthApiCandidates(path)[0] ?? path
}
