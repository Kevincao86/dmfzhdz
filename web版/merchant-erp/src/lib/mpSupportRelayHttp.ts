/**
 * 浏览器侧小程序客服中继（与 达人/星选 supportRelayMp 同源）：
 * POST /erp-api/meoo-ops-mp-support-relay → 轻量 auth-api → ECS Postgres。
 * 供星选 Web（履约后台）浮窗使用，会话 ID 以 lq-mp- 开头，进入运营台「小程序在线客服」。
 */

const MP_SESSION_KEY = 'meoo_xingxuan_web_support_sid'
const MP_GUEST_FP_KEY = 'meoo_xingxuan_web_support_gfp'

export type MpSupportRelayRole = 'user' | 'bot' | 'agent' | 'system' | 'ops'

export type MpSupportRelayMessage = {
  id: string
  role: MpSupportRelayRole
  text: string
  at: string
  ts: number
}

function normalizeErpApiBase(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (/api\.mofangdianai\.com/i.test(trimmed)) return 'https://mofangdianai.com/erp-api'
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    if (u.hostname === 'api.mofangdianai.com') return 'https://mofangdianai.com/erp-api'
    if (u.hostname === 'mofangdianai.com' && !u.pathname.startsWith('/erp-api')) {
      const tail = u.pathname === '/' ? '' : u.pathname
      u.pathname = `/erp-api${tail}`
    }
    return u.toString().replace(/\/$/, '').replace(/\/erp-api\/api$/i, '/erp-api')
  } catch {
    return ''
  }
}

/** 解析轻量 erp-api 根（与履约 mpApiBase / 商家 ERP 一致） */
export function resolveMpSupportRelayApiBase(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (/^dr\./i.test(host) || /^cs\./i.test(host) || /^fws\./i.test(host)) {
      return `${window.location.origin}/erp-api`
    }
    if (import.meta.env.DEV && (host === '127.0.0.1' || host === 'localhost')) {
      return `${window.location.origin}/erp-api`
    }
  }
  const fromEnv = normalizeErpApiBase(
    String(
      (import.meta.env.VITE_MP_API_BASE as string | undefined) ||
        (import.meta.env.VITE_ERP_AUTH_API_BASE as string | undefined) ||
        '',
    ),
  )
  if (fromEnv) return fromEnv
  return 'https://mofangdianai.com/erp-api'
}

function buildRelayUrl(apiPath: string): string {
  const base = resolveMpSupportRelayApiBase().replace(/\/$/, '')
  let path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  path = path.replace(/^\/api\//, '/')
  if (base.endsWith('/erp-api')) return `${base}${path}`
  return `${base}${path.startsWith('/api/') ? path : `/api${path}`}`
}

function randomPart(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function relayFromToRole(from: string): MpSupportRelayRole {
  if (from === 'ops') return 'ops'
  if (from === 'system') return 'system'
  if (from === 'agent') return 'agent'
  if (from === 'bot') return 'bot'
  return 'user'
}

export function getOrCreateMpSupportSessionId(): string {
  try {
    const existing = localStorage.getItem(MP_SESSION_KEY)
    if (existing && /^lq-mp[-:]/i.test(existing.trim())) return existing.trim()
    const sid = `lq-mp-${randomPart()}`
    localStorage.setItem(MP_SESSION_KEY, sid)
    return sid
  } catch {
    return `lq-mp-${randomPart()}`
  }
}

export function getOrCreateMpSupportGuestFingerprint(): string {
  try {
    const existing = localStorage.getItem(MP_GUEST_FP_KEY)
    if (existing && existing.trim().length >= 8) {
      const raw = existing.trim().replace(/^lq-mp:/i, '')
      return `lq-mp:${raw}`
    }
    const raw = `gf_${randomPart()}${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem(MP_GUEST_FP_KEY, raw)
    return `lq-mp:${raw}`
  } catch {
    return `lq-mp:gf_${randomPart()}`
  }
}

async function relayApi(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = buildRelayUrl('/api/meoo-ops-mp-support-relay')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  let data: Record<string, unknown> = {}
  try {
    data = (await res.json()) as Record<string, unknown>
  } catch {
    /* ignore */
  }
  if (!res.ok || data.ok === false) {
    const parts = [data.detail, data.hint, data.error, `HTTP ${res.status}`].filter(Boolean)
    throw new Error(parts.join(' — ') || '客服通道请求失败')
  }
  return data
}

function rowToMessage(row: Record<string, unknown>): MpSupportRelayMessage | null {
  const ts = Number(row.ts) || 0
  const id = String(row.client_msg_id || row.id || '').trim()
  if (!id) return null
  const fromRaw =
    row.from_role != null && String(row.from_role).trim() !== ''
      ? String(row.from_role)
      : String(row.role || 'user')
  return {
    id,
    role: relayFromToRole(fromRaw),
    text: String(row.text || ''),
    at: String(row.at || formatTime(ts)),
    ts,
  }
}

export function mergeMpSupportMessages(
  prev: MpSupportRelayMessage[],
  rows: Array<Record<string, unknown> | MpSupportRelayMessage>,
): MpSupportRelayMessage[] {
  const map = new Map<string, MpSupportRelayMessage>()
  for (const m of prev) {
    if (m?.id) map.set(m.id, m)
  }
  for (const r of rows) {
    const m = rowToMessage(r as Record<string, unknown>)
    if (m) map.set(m.id, m)
  }
  return [...map.values()].sort((a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.id.localeCompare(b.id)))
}

export async function fetchMpSupportMessages(sessionId: string): Promise<MpSupportRelayMessage[]> {
  const data = await relayApi({
    action: 'fetch_messages',
    sessionId,
    guestFingerprint: getOrCreateMpSupportGuestFingerprint(),
  })
  const raw = Array.isArray(data.messages) ? (data.messages as Record<string, unknown>[]) : []
  return mergeMpSupportMessages([], raw)
}

export async function sendMpSupportLine(input: {
  sessionId: string
  fromRole: Exclude<MpSupportRelayRole, 'ops'>
  text: string
  clientMsgId: string
  customerId?: string
  enterpriseName?: string
}): Promise<void> {
  await relayApi({
    action: 'send_message',
    sessionId: input.sessionId,
    guestFingerprint: getOrCreateMpSupportGuestFingerprint(),
    fromRole: input.fromRole,
    text: input.text,
    clientMsgId: input.clientMsgId,
    ts: Date.now(),
    customerId: input.customerId || '',
    enterpriseName: input.enterpriseName || '灵祺星选·Web',
  })
}

export function newMpSupportMsgId(): string {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
