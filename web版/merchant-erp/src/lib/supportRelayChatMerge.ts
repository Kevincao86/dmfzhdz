import { formatSupportRelayTime, type SupportRelayChatLine } from './supportRelay'

export type ChatRole = 'user' | 'bot' | 'agent' | 'ops' | 'system'

export type RelayChatRow = {
  from_role: string
  text: string
  ts: number
  client_msg_id: string
}

export type ChatMessage = {
  id: string
  role: ChatRole
  text: string
  at: string
  ts: number
}

export function relayFromToRole(from: SupportRelayChatLine['from']): ChatRole {
  if (from === 'ops') return 'ops'
  if (from === 'system') return 'system'
  if (from === 'agent') return 'agent'
  if (from === 'bot') return 'bot'
  return 'user'
}

export function rowToChatMessage(row: RelayChatRow): ChatMessage {
  return {
    id: row.client_msg_id,
    role: relayFromToRole(row.from_role as SupportRelayChatLine['from']),
    text: row.text,
    at: formatSupportRelayTime(row.ts),
    ts: row.ts,
  }
}

/** 轮询与 Realtime 兜底合并：同一 client_msg_id 以服务端为准 */
export function mergeRelayChatMessages(prev: ChatMessage[], rows: RelayChatRow[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>()
  for (const m of prev) map.set(m.id, m)
  for (const r of rows) {
    map.set(r.client_msg_id, rowToChatMessage(r))
  }
  return [...map.values()].sort((a, b) =>
    a.ts !== b.ts ? a.ts - b.ts : a.id.localeCompare(b.id),
  )
}
