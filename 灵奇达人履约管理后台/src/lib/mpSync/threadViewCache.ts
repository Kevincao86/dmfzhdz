/** 星选消息页：先读本机上次的列表和会话，网络回来后再并入新内容。 */
import { scopedStorageKey } from '../mpAccountLocalScope'

const CHAT_SESSIONS = 'mp_chat_sessions_view_v1'
const GROUP_SESSIONS = 'mp_group_sessions_view_v1'
const NOTIFICATIONS = 'mp_ntf_rows_view_v1'
const PRIVATE_THREAD = 'mp_private_thread_v1_'
const GROUP_THREAD = 'mp_group_thread_v1_'
const MAX_LIST = 80
const MAX_MSGS = 200

function readJson<T>(base: string): T | null {
  try {
    const raw = localStorage.getItem(scopedStorageKey(base))
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(base: string, value: unknown) {
  try {
    localStorage.setItem(scopedStorageKey(base), JSON.stringify(value))
  } catch {
    /* 缓存写失败不影响当前页 */
  }
}

function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export function readChatSessions<T>(): T[] {
  return asList<T>(readJson(CHAT_SESSIONS)).slice(0, MAX_LIST)
}

export function writeChatSessions(list: unknown[]) {
  writeJson(CHAT_SESSIONS, asList(list).slice(0, MAX_LIST))
}

export function readGroupSessions<T>(): T[] {
  return asList<T>(readJson(GROUP_SESSIONS)).slice(0, MAX_LIST)
}

export function writeGroupSessions(list: unknown[]) {
  writeJson(GROUP_SESSIONS, asList(list).slice(0, MAX_LIST))
}

export function readNotifications<T>(): T[] {
  return asList<T>(readJson(NOTIFICATIONS)).slice(0, MAX_LIST)
}

export function writeNotifications(list: unknown[]) {
  writeJson(NOTIFICATIONS, asList(list).slice(0, MAX_LIST))
}

export function readPrivateThread<T>(sessionId: string): T[] {
  const id = String(sessionId || '').trim()
  if (!id) return []
  return asList<T>(readJson(PRIVATE_THREAD + id)).slice(-MAX_MSGS)
}

export function writePrivateThread(sessionId: string, list: unknown[]) {
  const id = String(sessionId || '').trim()
  if (!id) return
  writeJson(PRIVATE_THREAD + id, asList(list).slice(-MAX_MSGS))
}

export type GroupThreadCache<T> = {
  title?: string
  memberCount?: number
  canSend?: boolean
  statusSub?: string
  messages: T[]
}

export function readGroupThread<T>(mpOrderId: string): GroupThreadCache<T> | null {
  const id = String(mpOrderId || '').trim()
  if (!id) return null
  const row = readJson<GroupThreadCache<T>>(GROUP_THREAD + id)
  if (!row || !Array.isArray(row.messages)) return null
  return { ...row, messages: row.messages.slice(-MAX_MSGS) }
}

export function writeGroupThread(mpOrderId: string, payload: GroupThreadCache<unknown>) {
  const id = String(mpOrderId || '').trim()
  if (!id) return
  writeJson(GROUP_THREAD + id, {
    title: payload.title || '商单群',
    memberCount: Number(payload.memberCount) || 0,
    canSend: payload.canSend !== false,
    statusSub: payload.statusSub || '',
    messages: asList(payload.messages).slice(-MAX_MSGS),
  })
}

export function mergeById<T extends { id?: string; ts?: number }>(prev: T[], next: T[]): T[] {
  const map = new Map<string, T>()
  for (const m of prev || []) {
    if (m && m.id) map.set(String(m.id), m)
  }
  for (const m of next || []) {
    if (m && m.id) map.set(String(m.id), m)
  }
  return [...map.values()].sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0))
}
