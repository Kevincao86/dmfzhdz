const MSG_KEY = 'meoo_talent_messages_v1'
const NOTIFY_KEY = 'meoo_talent_notifications_v1'

const CATEGORY_LABELS = {
  order: '订单',
  business: '业务',
  system: '系统',
}

function readList(key) {
  try {
    const raw = wx.getStorageSync(key)
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeList(key, list) {
  wx.setStorageSync(key, JSON.stringify(list.slice(0, 100)))
}

function sortTsFromId(id) {
  const m = String(id || '').match(/(?:msg|ntf)-(\d+)/)
  return m ? Number(m[1]) : 0
}

function normalizeCategory(cat) {
  if (cat === 'order' || cat === 'business' || cat === 'system') return cat
  return 'system'
}

function readAllNotificationRows() {
  const merged = [...readList(NOTIFY_KEY), ...readList(MSG_KEY)]
  return merged
    .map((row) => ({
      ...row,
      category: normalizeCategory(row.category),
      categoryLabel: CATEGORY_LABELS[normalizeCategory(row.category)],
    }))
    .sort((a, b) => sortTsFromId(b.id) - sortTsFromId(a.id))
}

function readMessages() {
  return readList(MSG_KEY)
}

function readNotifications() {
  return readAllNotificationRows()
}

function pushNotification(item) {
  const list = readList(NOTIFY_KEY)
  const cat = normalizeCategory(item && item.category)
  list.unshift({
    title: '',
    body: '',
    ...(item || {}),
    id: `ntf-${Date.now()}`,
    read: false,
    category: cat,
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  })
  writeList(NOTIFY_KEY, list)
}

/** @deprecated 统一写入通知流，在「我的-消息通知」展示 */
function pushMessage(item) {
  pushNotification({ ...item, category: 'business' })
}

function unreadNotificationCount() {
  return readAllNotificationRows().filter((m) => !m.read).length
}

function unreadMessageCount() {
  return readList(MSG_KEY).filter((m) => !m.read).length
}

function markMessagesRead() {
  writeList(
    MSG_KEY,
    readMessages().map((m) => ({ ...m, read: true })),
  )
}

function markNotificationsRead() {
  writeList(
    NOTIFY_KEY,
    readList(NOTIFY_KEY).map((m) => ({ ...m, read: true })),
  )
  markMessagesRead()
}

const INBOX_SEEN_KEY = 'meoo_talent_inbox_seen_v1'
const talentInboxMatch = require('./talentInboxMatch.js')

function readInboxSeenSet() {
  try {
    const raw = wx.getStorageSync(INBOX_SEEN_KEY)
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw
    return new Set(Array.isArray(list) ? list.map(String) : [])
  } catch {
    return new Set()
  }
}

function markInboxSeen(ids) {
  const set = readInboxSeenSet()
  for (const id of ids || []) set.add(String(id))
  try {
    wx.setStorageSync(INBOX_SEEN_KEY, JSON.stringify([...set].slice(-500)))
  } catch (_) {}
}

/** 合并 registry 站内信（达人：会员 id / 手机号 / 账号 / 报名 id 匹配） */
function inboxRowsForTalent(reg, member) {
  if (!reg || !member) return []
  const inbox = Array.isArray(reg.mpTalentInbox) ? reg.mpTalentInbox : []
  const keys = talentInboxMatch.talentMatchKeys(member)
  const seen = readInboxSeenSet()
  return inbox
    .filter((row) => talentInboxMatch.inboxRowMatchesTalent(row, keys, member))
    .map((row) => ({
      id: row.id,
      title: row.title || '通知',
      body: row.body || '',
      category: normalizeCategory(row.category),
      categoryLabel: CATEGORY_LABELS[normalizeCategory(row.category)],
      createdAt: row.createdAt || '',
      read: !!row.read || seen.has(String(row.id)),
      fromRegistry: true,
    }))
    .sort((a, b) => sortTsFromId(b.id) - sortTsFromId(a.id))
}

function mergeRegistryInboxForTalent(reg, member) {
  const selectionRows = talentInboxMatch.buildSelectionNoticeRows(reg, member)
  for (let i = 0; i < selectionRows.length; i++) {
    talentInboxMatch.markSelectionNoticeSent(selectionRows[i].dedupeKey)
  }
  const remote = inboxRowsForTalent(reg, member)
  const merged = [...selectionRows, ...remote]
  const local = readAllNotificationRows()
  const remoteIds = new Set(merged.map((r) => r.id))
  const rest = local.filter((r) => !remoteIds.has(r.id))
  return [...merged, ...rest].sort((a, b) => sortTsFromId(b.id) - sortTsFromId(a.id))
}

module.exports = {
  CATEGORY_LABELS,
  readMessages,
  readNotifications,
  pushMessage,
  pushNotification,
  unreadMessageCount,
  unreadNotificationCount,
  markMessagesRead,
  markNotificationsRead,
  inboxRowsForTalent,
  /** @deprecated 使用 inboxRowsForTalent */
  inboxRowsForTalentMember: inboxRowsForTalent,
  mergeRegistryInboxForTalent,
  markInboxSeen,
}
