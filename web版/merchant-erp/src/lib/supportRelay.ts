export const SUPPORT_RELAY_SESSION_STORAGE_KEY = 'meoo_support_relay_sid'

/** 未登录访客与云端会话对齐用（与 session_id 同存 localStorage，避免同 sid 多标签指纹不一致误拉历史） */
export const SUPPORT_RELAY_GUEST_FP_KEY = 'meoo_support_relay_guest_fp'

export type SupportRelayChatLine = {
  type: 'chat'
  sessionId: string
  from: 'user' | 'bot' | 'agent' | 'system' | 'ops'
  text: string
  ts: number
  id: string
  customerId?: string
  enterpriseName?: string
}

export type SupportRelaySessionMetaMessage = {
  type: 'session_meta'
  sessionId: string
  /** 登录账户编号（如 DMF001），展示为「客户ID」 */
  customerId?: string
  /** 租户企业名称 tenants.name */
  enterpriseName?: string
}

export type SupportRelayIdentifyMessage = {
  type: 'identify'
  role: 'merchant' | 'ops'
  sessionId?: string
  customerId?: string
  enterpriseName?: string
}

/** 与商家管理后台 vite-plugins/supportOnlineWs 的 upgrade 路径一致 */
const DEV_ONLINE_PATH = '/__meoo_support_online'

export function getSupportRelayWsUrl(): string | null {
  const raw = import.meta.env.VITE_SUPPORT_RELAY_WS
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim()
  if (!import.meta.env.DEV) return null
  /** dev 默认：同源 ws，由 ERP 的 Vite server.proxy 转发到 VITE_MERCHANT_ADMIN_ORIGIN（见 vite.config.ts） */
  if (typeof window !== 'undefined' && window.location?.host) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}${DEV_ONLINE_PATH}`
  }
  return `ws://127.0.0.1:5173${DEV_ONLINE_PATH}`
}

function randomSid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `sid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/** 商家端：同浏览器持久化会话，便于运营台持续跟进同一对话 */
export function getOrCreateSupportRelaySessionId(): string {
  try {
    const existing = localStorage.getItem(SUPPORT_RELAY_SESSION_STORAGE_KEY)
    if (existing && existing.trim().length > 0) return existing.trim()
    const sid = randomSid()
    localStorage.setItem(SUPPORT_RELAY_SESSION_STORAGE_KEY, sid)
    return sid
  } catch {
    return randomSid()
  }
}

function randomGuestFingerprint(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '')
  }
  return `gf_${Date.now()}_${Math.random().toString(36).slice(2, 18)}`
}

/** 登录前在线客服：与 Supabase anon 策略及 RPC 对齐 */
export function getOrCreateSupportRelayGuestFingerprint(): string {
  try {
    const existing = window.localStorage.getItem(SUPPORT_RELAY_GUEST_FP_KEY)
    if (existing && existing.trim().length >= 16) return existing.trim()
    const fp = randomGuestFingerprint()
    window.localStorage.setItem(SUPPORT_RELAY_GUEST_FP_KEY, fp)
    return fp
  } catch {
    return randomGuestFingerprint()
  }
}

export function formatSupportRelayTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
