const HANDLED_KEY = 'meoo_inbox_selection_handled_v1'

function readHandledMap() {
  try {
    const raw = wx.getStorageSync(HANDLED_KEY)
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

function writeHandledMap(map) {
  try {
    const keys = Object.keys(map)
    const trimmed = {}
    for (let i = Math.max(0, keys.length - 300); i < keys.length; i++) {
      trimmed[keys[i]] = map[keys[i]]
    }
    wx.setStorageSync(HANDLED_KEY, JSON.stringify(trimmed))
  } catch (_) {}
}

function noticeActionKey(row) {
  if (!row) return ''
  if (row.dedupeKey) return String(row.dedupeKey)
  const mp = String(row.mpOrderId || '').trim()
  const app = String(row.applicantId || '').trim()
  if (mp && app) return `sel-${mp}-${app}`
  return String(row.id || '').trim()
}

function isSelectionNotice(row) {
  if (!row) return false
  if (row.noticeType === 'selection' || row.fromSelection) return true
  return /恭喜入选/.test(String(row.title || ''))
}

function getHandledAction(row) {
  const key = noticeActionKey(row)
  if (!key) return ''
  return String(readHandledMap()[key] || '')
}

function isPinned(row) {
  return isSelectionNotice(row) && !getHandledAction(row)
}

function markHandled(row, action) {
  const key = noticeActionKey(row)
  if (!key) return
  const map = readHandledMap()
  map[key] = action === 'joined' ? 'joined' : 'confirmed'
  writeHandledMap(map)
}

function sortRows(rows) {
  const list = (rows || []).slice()
  list.sort((a, b) => {
    const pa = isPinned(a) ? 1 : 0
    const pb = isPinned(b) ? 1 : 0
    if (pa !== pb) return pb - pa
    const ta = String(a.createdAt || '')
    const tb = String(b.createdAt || '')
    return tb.localeCompare(ta)
  })
  return list
}

function enrichRow(row) {
  const handled = getHandledAction(row)
  const pinned = isPinned(row)
  const read = !!row.read || !!handled
  return {
    ...row,
    pinned,
    read,
    readLabel: read ? '已读' : '未读',
    showSelectionActions: isSelectionNotice(row) && pinned,
    handledAction: handled,
  }
}

module.exports = {
  noticeActionKey,
  isSelectionNotice,
  isPinned,
  getHandledAction,
  markHandled,
  sortRows,
  enrichRow,
}
