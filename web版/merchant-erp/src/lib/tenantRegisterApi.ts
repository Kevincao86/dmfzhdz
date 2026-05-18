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

export async function sendRegistrationSms(phone: string): Promise<SmsSendResult> {
  const res = await fetch('/api/meoo-auth-sms-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  })
  const j = (await res.json().catch(() => ({}))) as SmsSendResult & { message?: string }
  if (!res.ok) {
    return { ok: false, error: j.error ?? `http_${res.status}`, message: j.message }
  }
  return { ok: j.ok !== false, message: j.message, devCode: j.devCode }
}

export async function registerMerchantAccount(body: {
  loginName: string
  merchantName: string
  phone: string
  smsCode: string
  password: string
  confirmPassword: string
}): Promise<RegisterResult> {
  const res = await fetch('/api/meoo-auth-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = (await res.json().catch(() => ({}))) as RegisterResult & { message?: string; detail?: string }
  if (!res.ok) {
    return {
      ok: false,
      error: j.error ?? `http_${res.status}`,
      message: j.message,
      detail: j.detail,
    }
  }
  return { ok: j.ok !== false, message: j.message }
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
