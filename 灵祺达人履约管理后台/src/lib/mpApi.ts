import type { MpAccount } from './mpSession'
import { getToken } from './mpSession'

const API_BASE = (import.meta.env.VITE_MP_API_BASE as string | undefined)?.replace(/\/$/, '') || ''

function apiUrl(path: string) {
  if (!API_BASE && import.meta.env.PROD) {
    throw new Error('未配置 VITE_MP_API_BASE，请在 Vercel 设置如 https://mofangdianai.com/erp-api 后重新部署')
  }
  return `${API_BASE}${path}`
}

async function parseJsonRes(res: Response) {
  const text = await res.text()
  if (!text.trim()) {
    throw new Error(
      API_BASE
        ? `接口返回为空（HTTP ${res.status}）`
        : '接口返回为空：生产环境请配置 VITE_MP_API_BASE；本地请用 npm run dev 启动',
    )
  }
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`接口返回非 JSON（HTTP ${res.status}）`)
  }
}

function throwApiError(data: Record<string, unknown>, status: number) {
  const msg = String(data.message || data.error || data.detail || `http_${status}`)
  throw new Error(msg)
}

async function mpAuthRequest(action: string, body: Record<string, unknown> = {}) {
  const res = await fetch(apiUrl('/api/meoo-ops-mp-auth'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { 'X-Mp-Session': getToken() } : {}),
    },
    body: JSON.stringify({ action, ...body }),
  })
  const data = await parseJsonRes(res)
  if (!res.ok || data.ok === false) throwApiError(data, res.status)
  return data
}

export async function passwordLogin(loginName: string, password: string) {
  const data = await mpAuthRequest('password_login', { loginName, password })
  return {
    token: String(data.token),
    account: data.account as MpAccount,
  }
}

export async function scanCreate() {
  const data = await mpAuthRequest('scan_create')
  return {
    ticket: String(data.ticket),
    expiresAt: String(data.expiresAt),
    qrPayload: String(data.qrPayload),
    pollUrl: String(data.pollUrl),
  }
}

export async function scanPoll(ticket: string) {
  const q = new URLSearchParams({ action: 'scan_poll', ticket })
  const res = await fetch(apiUrl(`/api/meoo-ops-mp-auth?${q}`))
  const data = await parseJsonRes(res)
  if (!res.ok || data.ok === false) throw new Error(String(data.error))
  return {
    status: String(data.status),
    token: data.token ? String(data.token) : undefined,
    account: data.account as MpAccount | undefined,
    message: data.message ? String(data.message) : undefined,
  }
}

export async function switchRole(role: 'talent' | 'pr') {
  const data = await mpAuthRequest('switch_role', { role })
  return { account: data.account as MpAccount }
}

export async function fetchSession() {
  const data = await mpAuthRequest('session')
  return { account: data.account as MpAccount }
}

/** 设置登录名；password 留空则仅改登录名、保留原密码 */
export async function setLoginCredentials(loginName: string, password?: string) {
  const data = await mpAuthRequest('set_login_credentials', {
    loginName: loginName.trim(),
    password: password ?? '',
  })
  return { account: data.account as MpAccount }
}

export async function sendRegisterSms(phone: string) {
  const res = await fetch(apiUrl('/api/meoo-auth-sms-send'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: phone.trim() }),
  })
  const data = await parseJsonRes(res)
  if (!res.ok || data.ok === false) throwApiError(data, res.status)
  return data
}

export async function phoneRegister(input: {
  phone: string
  smsCode: string
  password: string
  role: 'talent' | 'pr'
}) {
  const data = await mpAuthRequest('register', {
    phone: input.phone.trim(),
    smsCode: input.smsCode.trim(),
    password: input.password,
    role: input.role,
  })
  return {
    token: String(data.token),
    account: data.account as MpAccount,
  }
}

export async function fetchMpRegistry() {
  const paths = ['/api/meoo-ops-mp-hall-registry', '/api/meoo-ops-sync-registry', '/api/ops-sync/registry']
  let lastErr = 'registry_failed'
  for (const path of paths) {
    try {
      const res = await fetch(apiUrl(path))
      const data = await parseJsonRes(res)
      if (!res.ok || data.ok === false) {
        lastErr = String(data.error || data.detail || `http_${res.status}`)
        continue
      }
      return data
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}

/** @deprecated use fetchMpRegistry */
export async function fetchHallRegistry() {
  return fetchMpRegistry()
}

export async function postMpRecruitmentAi(body: Record<string, unknown>) {
  const res = await fetch(apiUrl('/api/meoo-mp-recruitment-ai'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { 'X-Mp-Session': getToken() } : {}) },
    body: JSON.stringify(body),
  })
  const data = await parseJsonRes(res)
  if (!res.ok || data.ok === false) throw new Error(String(data.error || `http_${res.status}`))
  return data
}

export async function patchMpRecruitmentOrder(body: Record<string, unknown>) {
  return postMpWithFallback(
    ['/api/meoo-ops-mp-recruitment-orders-patch', '/api/ops-sync/mp-recruitment-orders/patch'],
    body,
  )
}

async function postMpWithFallback(paths: string[], body: Record<string, unknown>) {
  let lastErr = 'request_failed'
  for (const path of paths) {
    try {
      const res = await fetch(apiUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getToken() ? { 'X-Mp-Session': getToken() } : {}) },
        body: JSON.stringify(body),
      })
      const data = await parseJsonRes(res)
      if (!res.ok || data.ok === false) {
        lastErr = String(data.error || `http_${res.status}`)
        if (/404|not_found/i.test(lastErr)) continue
        throw new Error(lastErr)
      }
      return data
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (!/404|not_found/i.test(lastErr)) throw e
    }
  }
  throw new Error(lastErr)
}

export async function applyToMpOrder(mpOrderId: string, applicant: Record<string, unknown>) {
  return postMpWithFallback(
    ['/api/meoo-ops-mp-recruitment-orders-apply', '/api/ops-sync/mp-recruitment-orders/apply'],
    { mpOrderId, applicant },
  )
}

export async function registerTalentMember(member: Record<string, unknown>) {
  return postMpWithFallback(
    ['/api/meoo-ops-mp-talent-member-register', '/api/ops-sync/mp-talent-members/register'],
    { member },
  )
}

export async function registerPrUser(prUser: Record<string, unknown>) {
  return postMpWithFallback(
    ['/api/meoo-ops-mp-pr-user-register', '/api/ops-sync/mp-pr-users/register'],
    { prUser },
  )
}

export async function appendMpRecruitmentOrder(order: Record<string, unknown>) {
  return postMpWithFallback(
    ['/api/meoo-ops-mp-recruitment-orders-append', '/api/ops-sync/mp-recruitment-orders/append'],
    { order },
  )
}

export async function updateMpRecruitmentOrder(order: Record<string, unknown>) {
  const id = String(order.id || '')
  return postMpWithFallback(
    ['/api/meoo-ops-mp-recruitment-orders-patch', '/api/ops-sync/mp-recruitment-orders/patch'],
    { id, order },
  )
}
