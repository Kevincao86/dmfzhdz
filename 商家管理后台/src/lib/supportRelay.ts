export const SUPPORT_RELAY_SESSION_STORAGE_KEY = 'meoo_support_relay_sid'

export type SupportRelayChatLine = {
  type: 'chat'
  sessionId: string
  from: 'user' | 'bot' | 'agent' | 'system' | 'ops'
  text: string
  ts: number
  id: string
}

/** 商家连接或更新资料时下发，供运营台展示客户名称与 ID */
export type SupportRelaySessionMetaMessage = {
  type: 'session_meta'
  sessionId: string
  /** 登录账户编号（如 DMF001） */
  customerId?: string
  /** 企业名称 tenants.name */
  enterpriseName?: string
}

export type SupportRelayIdentifyMessage = {
  type: 'identify'
  role: 'merchant' | 'ops'
  sessionId?: string
  customerId?: string
  enterpriseName?: string
}

/** 运营端请求按时间段导出（本机 dev 插件支持；外部网关可忽略） */
export type SupportRelayExportQueryMessage = {
  type: 'export_query'
  exportId: string
  startTs: number
  endTs: number
  /** 仅该会话；不传表示全部会话 */
  sessionId?: string
}

export type SupportRelayExportResultMessage = {
  type: 'export_result'
  exportId: string
  lines: SupportRelayChatLine[]
}

const DEV_ONLINE_PATH = '/__meoo_support_online'

export function getSupportRelayWsUrl(): string | null {
  const raw = import.meta.env.VITE_SUPPORT_RELAY_WS
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim()
  if (!import.meta.env.DEV) return null
  if (typeof window !== 'undefined' && window.location?.host) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}${DEV_ONLINE_PATH}`
  }
  return `ws://127.0.0.1:5174${DEV_ONLINE_PATH}`
}

function randomSid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `sid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

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

export function formatSupportRelayTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
