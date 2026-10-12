/**
 * 消息列表和会话正文的本机缓存。打开页面先画出上次内容，网络回来后再并入新消息。
 */
const scope = require('./mpAccountLocalScope.js')

const CHAT_SESSIONS = 'mp_chat_sessions_view_v1'
const GROUP_SESSIONS = 'mp_group_sessions_view_v1'
const NOTIFICATIONS = 'mp_ntf_rows_view_v1'
const PRIVATE_THREAD = 'mp_private_thread_v1_'
const GROUP_THREAD = 'mp_group_thread_v1_'
const MAX_LIST = 80
const MAX_MSGS = 200

function keyOf(base) {
  return scope.scopedStorageKey(base)
}

function readJson(base) {
  try {
    const raw = wx.getStorageSync(keyOf(base))
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (_) {
    return null
  }
}

function writeJson(base, value) {
  try {
    wx.setStorageSync(keyOf(base), JSON.stringify(value))
  } catch (_) {
    /* 缓存写失败不影响当前页 */
  }
}

function asList(value) {
  return Array.isArray(value) ? value : []
}

function readChatSessions() {
  return asList(readJson(CHAT_SESSIONS)).slice(0, MAX_LIST)
}

function writeChatSessions(list) {
  writeJson(CHAT_SESSIONS, asList(list).slice(0, MAX_LIST))
}

function readGroupSessions() {
  return asList(readJson(GROUP_SESSIONS)).slice(0, MAX_LIST)
}

function writeGroupSessions(list) {
  writeJson(GROUP_SESSIONS, asList(list).slice(0, MAX_LIST))
}

function readNotifications() {
  return asList(readJson(NOTIFICATIONS)).slice(0, MAX_LIST)
}

function writeNotifications(list) {
  writeJson(NOTIFICATIONS, asList(list).slice(0, MAX_LIST))
}

function readPrivateThread(sessionId) {
  const id = String(sessionId || '').trim()
  if (!id) return []
  return asList(readJson(PRIVATE_THREAD + id)).slice(-MAX_MSGS)
}

function writePrivateThread(sessionId, list) {
  const id = String(sessionId || '').trim()
  if (!id) return
  writeJson(PRIVATE_THREAD + id, asList(list).slice(-MAX_MSGS))
}

function readGroupThread(mpOrderId) {
  const id = String(mpOrderId || '').trim()
  if (!id) return null
  const row = readJson(GROUP_THREAD + id)
  if (!row || typeof row !== 'object' || !Array.isArray(row.messages)) return null
  return { ...row, messages: row.messages.slice(-MAX_MSGS) }
}

function writeGroupThread(mpOrderId, payload) {
  const id = String(mpOrderId || '').trim()
  if (!id || !payload) return
  writeJson(GROUP_THREAD + id, {
    groupTitle: payload.groupTitle || '商单群',
    memberCount: Number(payload.memberCount) || 0,
    groupClosed: !!payload.groupClosed,
    canSend: payload.canSend !== false,
    mentionMembers: asList(payload.mentionMembers).slice(0, 40),
    messages: asList(payload.messages).slice(-MAX_MSGS),
  })
}

function mergeById(prev, next) {
  const map = new Map()
  asList(prev).forEach((m) => {
    if (m && m.id) map.set(String(m.id), m)
  })
  asList(next).forEach((m) => {
    if (m && m.id) map.set(String(m.id), m)
  })
  return [...map.values()].sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0))
}

module.exports = {
  readChatSessions,
  writeChatSessions,
  readGroupSessions,
  writeGroupSessions,
  readNotifications,
  writeNotifications,
  readPrivateThread,
  writePrivateThread,
  readGroupThread,
  writeGroupThread,
  mergeById,
}
