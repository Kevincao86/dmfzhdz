import type { MpAccount } from './mpSession'
import { getToken } from './mpSession'

const API_BASE = (import.meta.env.VITE_MP_API_BASE as string | undefined)?.replace(/\/$/, '') || ''

async function mpAuthRequest(action: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${API_BASE}/api/meoo-ops-mp-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { 'X-Mp-Session': getToken() } : {}),
    },
    body: JSON.stringify({ action, ...body }),
  })
  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok || data.ok === false) {
    throw new Error(String(data.error || `http_${res.status}`))
  }
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
  const res = await fetch(`${API_BASE}/api/meoo-ops-mp-auth?${q}`)
  const data = (await res.json()) as Record<string, unknown>
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

export async function fetchHallRegistry() {
  const res = await fetch(`${API_BASE}/api/meoo-ops-mp-hall-registry`)
  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok || data.ok === false) throw new Error(String(data.error || 'registry_failed'))
  return data as {
    mpRecruitmentOrders?: unknown[]
    mpTalentMembers?: unknown[]
  }
}
