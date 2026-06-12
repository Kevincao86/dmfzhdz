const MSG_KEY = 'meoo_talent_messages_v1'
const NOTIFY_KEY = 'meoo_talent_notifications_v1'

const CATEGORY_LABELS = {
  order: '订单',
  business: '业务',
  system: '系统',
}

const scope = require('./mpAccountLocalScope.js')
const auth = require('./auth.js')

const INBOX_SEEN_KEY = 'meoo_talent_inbox_seen_v1'
const talentInboxMatch = require('./talentInboxMatch.js')
const inboxRowEnrich = require('./inboxRowEnrich.js')
const inboxNoticeState = require('./inboxNoticeState.js')

function ownerIdsForFilter() {
  const account = auth.readAccount()
  return {
    ownerAccountId: scope.scopeIdFromAccount(account),
    memberId: String(account?.registryMemberId || '').trim(),
    talentId: String(account?.lingqiTalentId || '').trim(),
  }
}

function entryBelongsToCurrentAccount(entry, ids) {
  if (!entry) return false
  if (!entry.ownerAccountId && !entry.ownerMemberId && !entry.ownerTalentId) return false
  if (!ids.ownerAccountId) {
    if (ids.memberId && entry.ownerMemberId) return entry.ownerMemberId === ids.memberId
    if (ids.talentId && entry.ownerTalentId) return entry.ownerTalentId === ids.talentId
    return false
  }
  if (!entry.ownerAccountId) return false
  if (entry.ownerAccountId !== ids.ownerAccountId) return false
  if (entry.ownerMemberId && ids.memberId && entry.ownerMemberId !== ids.memberId) return false
  if (entry.ownerTalentId && ids.talentId && entry.ownerTalentId !== ids.talentId) return false
  return true
}

function storageKey(base) {
  return scope.scopedStorageKey(base)
}

function readList(key) {
  try {
    const raw = wx.getStorageSync(storageKey(key))
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw
    const rows = Array.isArray(list) ? list : []
    const ids = ownerIdsForFilter()
    return rows.filter((item) => entryBelongsToCurrentAccount(item, ids))
  } catch {
    return []
  }
}

function scheduleClientSync() {
  try {
    require('./mpAccountClientSync.js').schedulePush()
  } catch (_) {}
}

function writeList(key, list) {
  const ids = ownerIdsForFilter()
  const scoped = (list || []).filter((item) => entryBelongsToCurrentAccount(item, ids))
  wx.setStorageSync(storageKey(key), JSON.stringify(scoped.slice(0, 100)))
  scheduleClientSync()
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
  const ids = ownerIdsForFilter()
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
    ownerAccountId: ids.ownerAccountId,
    ownerMemberId: ids.memberId,
    ownerTalentId: ids.talentId,
  })
  writeList(NOTIFY_KEY, list)
}

/** @deprecated 统一写入通知流，在「我的-消息通知」展示 */
function pushMessage(item) {
  pushNotification({ ...item, category: 'business' })
}

function unreadNotificationCount(rows) {
  const list = rows || readAllNotificationRows()
  return list.filter((m) => !m.read).length
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

function markNotificationsRead(ids) {
  const idSet = ids && ids.length ? new Set(ids.map(String)) : null
  const patch = (m) => {
    if (idSet) return idSet.has(m.id) ? { ...m, read: true } : m
    return { ...m, read: true }
  }
  writeList(NOTIFY_KEY, readList(NOTIFY_KEY).map(patch))
  writeList(MSG_KEY, readList(MSG_KEY).map(patch))
  if (idSet) markInboxSeen([...idSet])
}

function readInboxSeenSet() {
  try {
    const raw = wx.getStorageSync(storageKey(INBOX_SEEN_KEY))
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
    wx.setStorageSync(storageKey(INBOX_SEEN_KEY), JSON.stringify([...set].slice(-500)))
    scheduleClientSync()
  } catch (_) {}
}

/** 合并 registry 站内信（达人：会员 id / 报名 id 严格匹配） */
function inboxRowsForTalent(reg, member) {
  if (!reg || !member) return []
  const inbox = Array.isArray(reg.mpTalentInbox) ? reg.mpTalentInbox : []
  const keys = talentInboxMatch.talentMatchKeys(member)
  const seen = readInboxSeenSet()
  return inbox
    .filter((row) => talentInboxMatch.inboxRowMatchesTalent(row, keys, member))
    .map((row) => {
      const isSel =
        row.noticeType === 'selection' || /恭喜入选/.test(String(row.title || ''))
      let imageUrl = row.imageUrl ? String(row.imageUrl) : ''
      if (isSel && !imageUrl && row.mpOrderId) {
        imageUrl = inboxRowEnrich.groupQrForMpOrder(reg, row.mpOrderId)
      }
      const cat = isSel ? 'business' : normalizeCategory(row.category)
      const mpId = String(row.mpOrderId || '').trim()
      const appId = String(row.applicantId || '').trim()
      return {
        id: row.id,
        title: row.title || '通知',
        body: row.body || '',
        imageUrl,
        category: cat,
        categoryLabel: CATEGORY_LABELS[cat],
        createdAt: row.createdAt || '',
        read: !!row.read || seen.has(String(row.id)),
        fromRegistry: true,
        noticeType: row.noticeType || (isSel ? 'selection' : ''),
        mpOrderId: mpId,
        applicantId: appId,
        dedupeKey: isSel && mpId && appId ? `sel-${mpId}-${appId}` : '',
        pinned: row.pinned !== false && isSel,
      }
    })
}

function dedupeSelectionInboxRows(rows) {
  const byKey = new Map()
  const others = []
  for (let i = 0; i < (rows || []).length; i++) {
    const row = rows[i]
    if (!row) continue
    if (!inboxNoticeState.isSelectionNotice(row)) {
      others.push(row)
      continue
    }
    const mp = String(row.mpOrderId || '').trim()
    const app = String(row.applicantId || '').trim()
    const key = mp && app ? `sel-${mp}-${app}` : String(row.id || i)
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, row)
      continue
    }
    const rank = (r) => {
      if (r && r.fromRegistry) return 3
      if (r && String(r.id || '').indexOf('inbox-') === 0) return 3
      if (r && r.fromSelection) return 1
      return 2
    }
    byKey.set(key, rank(row) >= rank(prev) ? row : prev)
  }
  return others.concat([...byKey.values()])
}

function mergeRegistryInboxForTalent(reg, member) {
  const seen = readInboxSeenSet()
  const selectionRows = talentInboxMatch.buildSelectionNoticeRows(reg, member).map((r) => ({
    ...r,
    read: !!r.read || seen.has(String(r.id)),
  }))
  const remote = inboxRowsForTalent(reg, member)
  const merged = dedupeSelectionInboxRows([...selectionRows, ...remote])
  const local = readAllNotificationRows()
  const remoteIds = new Set(merged.map((r) => r.id))
  const rest = local.filter((r) => !remoteIds.has(r.id))
  return inboxRowEnrich.enrichAndSort(reg, dedupeSelectionInboxRows([...merged, ...rest]))
}

function markAllNotificationsRead() {
  markNotificationsRead()
  const rows = readAllNotificationRows()
  markInboxSeen(rows.map((r) => r.id))
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
  markAllNotificationsRead,
  inboxRowsForTalent,
  inboxRowsForTalentMember: inboxRowsForTalent,
  mergeRegistryInboxForTalent,
  markInboxSeen,
}
