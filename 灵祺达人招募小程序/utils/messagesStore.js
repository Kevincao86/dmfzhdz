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
}
