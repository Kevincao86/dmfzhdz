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

/** 勿用 api.mofangdianai.com（常无 DNS）；统一为 mofangdianai.com 的 /erp-api 或 /api */
function normalizeErpAuthApiBase(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (/api\.mofangdianai\.com/i.test(trimmed) && !trimmed.includes('mofangdianai.com/erp-api')) {
    return 'https://mofangdianai.com/erp-api'
  }
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    if (u.hostname === 'api.mofangdianai.com') {
      return 'https://mofangdianai.com/erp-api'
    }
    return u.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

function sameOriginAuthApiUrl(path: string): string {
  if (typeof window !== 'undefined') return `${window.location.origin}${path}`
  return path
}

/** 拼接认证 API，避免 `api.xxx.com` + `meoo-auth-register` 变成非法主机名 */
function buildErpAuthRequestUrl(base: string, apiPath: string): string {
  const b = base.replace(/\/$/, '')
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  if (b.endsWith('/erp-api')) {
    const rel = path.replace(/^\/api\//, '')
    return new URL(rel, `${b}/`).href
  }
  return new URL(path, `${b}/`).href
}

/** 注册/登录 API：优先当前站点 /api（Vercel），再 ECS /erp-api，最后主站 mofangdianai.com */
function erpAuthApiCandidates(path: string): string[] {
  const urls: string[] = []
  const add = (u: string) => {
    if (u && !urls.includes(u)) urls.push(u)
  }

  add(sameOriginAuthApiUrl(path))

  const base = normalizeErpAuthApiBase(import.meta.env.VITE_ERP_AUTH_API_BASE ?? '')
  if (base) add(buildErpAuthRequestUrl(base, path))

  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host !== 'mofangdianai.com' && host !== 'www.mofangdianai.com') {
      add(`https://mofangdianai.com${path}`)
    }
  }

  return urls
}

function erpAuthApiUrl(path: string): string {
  return erpAuthApiCandidates(path)[0] ?? path
}

async function postAuthJson<T extends Record<string, unknown>>(
  path: string,
  body: unknown,
  action: string,
): Promise<{ res: Response; json: T } | { ok: false; error: string; message: string }> {
  const candidates = erpAuthApiCandidates(path)
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
      return { res, json }
    } catch (e) {
      lastMessage = toUserFacingError(e, action)
      if (i < candidates.length - 1) continue
    }
  }

  return { ok: false, error: 'network_error', message: lastMessage }
}

export async function sendAuthSms(phone: string): Promise<SmsSendResult> {
  // 短信发送始终走当前站点 Vercel /api（阿里云已在 Vercel 配置）
  const res = await fetch(sameOriginAuthApiUrl('/api/meoo-auth-sms-send'), {
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
  const posted = await postAuthJson<RegisterResult & { message?: string; detail?: string }>(
    '/api/meoo-auth-register',
    body,
    '注册',
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

export async function loginWithSmsCode(body: {
  phone: string
  smsCode: string
}): Promise<SmsLoginResult> {
  const posted = await postAuthJson<SmsLoginResult & { message?: string; detail?: string }>(
    '/api/meoo-auth-sms-login',
    body,
    '登录',
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
  return erpAuthApiUrl(path)
}
