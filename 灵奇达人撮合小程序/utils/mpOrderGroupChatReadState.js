const scope = require('./mpAccountLocalScope.js')

const KEY = 'meoo_mp_group_chat_read_v1'

function storageKey() {
  return scope.scopedStorageKey(KEY)
}

function readMap() {
  try {
    const raw = wx.getStorageSync(storageKey())
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}

function writeMap(map) {
  try {
    wx.setStorageSync(storageKey(), JSON.stringify(map || {}))
  } catch (_) {}
}

function getLastReadTs(mpOrderId) {
  const id = String(mpOrderId || '').trim()
  if (!id) return 0
  const map = readMap()
  const ts = Number(map[id])
  return Number.isFinite(ts) && ts > 0 ? ts : 0
}

function markRead(mpOrderId, ts) {
  const id = String(mpOrderId || '').trim()
  if (!id) return
  const nextTs = Number(ts)
  if (!Number.isFinite(nextTs) || nextTs <= 0) return
  const map = readMap()
  const prev = Number(map[id]) || 0
  if (nextTs <= prev) return
  map[id] = nextTs
  writeMap(map)
}

function unreadInGroup(group, myKey) {
  if (!group) return 0
  const mpOrderId = String(group.mpOrderId || '').trim()
  const lastRead = getLastReadTs(mpOrderId)
  const key = String(myKey || '').trim()
  const list = Array.isArray(group.messages) ? group.messages : []
  let count = 0
  for (let i = 0; i < list.length; i++) {
    const m = list[i]
    if (!m) continue
    if (key && String(m.fromParticipantKey || '') === key) continue
    const ts = Number(m.ts) || 0
    if (ts > lastRead) count += 1
  }
  return count
}

function totalUnread(groups, myKey) {
  let n = 0
  for (let i = 0; i < (groups || []).length; i++) {
    n += unreadInGroup(groups[i], myKey)
  }
  return n
}

module.exports = {
  getLastReadTs,
  markRead,
  unreadInGroup,
  totalUnread,
}
