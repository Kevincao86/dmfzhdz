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

/** 注册/登录 API：默认同源 Vercel；设 VITE_ERP_AUTH_API_BASE 则走 ECS（如 https://api.mofangdianai.com/erp-api） */
function erpAuthApiUrl(path: string): string {
  const base = (import.meta.env.VITE_ERP_AUTH_API_BASE ?? '').trim().replace(/\/$/, '')
  return base ? `${base}${path}` : path
}

export async function sendAuthSms(phone: string): Promise<SmsSendResult> {
  const res = await fetch(erpAuthApiUrl('/api/meoo-auth-sms-send'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  })
  const j = (await res.json().catch(() => ({}))) as SmsSendResult & {
    message?: string
    detail?: string
  }
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
  const res = await fetch(erpAuthApiUrl('/api/meoo-auth-register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = (await res.json().catch(() => ({}))) as RegisterResult & { message?: string; detail?: string }
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

export async function loginWithSmsCode(body: {
  phone: string
  smsCode: string
}): Promise<SmsLoginResult> {
  const res = await fetch(erpAuthApiUrl('/api/meoo-auth-sms-login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = (await res.json().catch(() => ({}))) as SmsLoginResult & { message?: string; detail?: string }
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
