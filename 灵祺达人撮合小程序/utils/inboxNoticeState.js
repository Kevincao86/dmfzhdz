const HANDLED_KEY = 'meoo_inbox_selection_handled_v1'
const scope = require('./mpAccountLocalScope.js')

function storageKey() {
  return scope.scopedStorageKey(HANDLED_KEY)
}

function migrateLegacyHandledMap() {
  const scoped = storageKey()
  if (scoped === HANDLED_KEY) return
  try {
    if (wx.getStorageSync(scoped)) return
    const legacy = wx.getStorageSync(HANDLED_KEY)
    if (!legacy) return
    wx.setStorageSync(scoped, typeof legacy === 'string' ? legacy : JSON.stringify(legacy))
    wx.removeStorageSync(HANDLED_KEY)
  } catch (_) {}
}

function readHandledMap() {
  migrateLegacyHandledMap()
  try {
    const raw = wx.getStorageSync(storageKey())
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

function writeHandledMap(map, opts) {
  try {
    const keys = Object.keys(map)
    const trimmed = {}
    for (let i = Math.max(0, keys.length - 300); i < keys.length; i++) {
      trimmed[keys[i]] = map[keys[i]]
    }
    wx.setStorageSync(storageKey(), JSON.stringify(trimmed))
    if (!opts || !opts.skipSync) {
      try {
        require('./mpAccountClientSync.js').schedulePush()
      } catch (_) {}
    }
  } catch (_) {}
}

function normalizeHandledMap(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const k of Object.keys(raw)) {
    const key = String(k || '').trim()
    if (!key) continue
    out[key] = raw[k] === 'joined' ? 'joined' : 'confirmed'
  }
  return out
}

function exportHandledMapForSync() {
  return readHandledMap()
}

function applyHandledMapFromSync(remote) {
  const incoming = normalizeHandledMap(remote)
  if (!Object.keys(incoming).length) return
  const local = readHandledMap()
  writeHandledMap({ ...local, ...incoming }, { skipSync: true })
}

function noticeActionKey(row) {
  if (!row) return ''
  if (row.dedupeKey) return String(row.dedupeKey)
  const mp = String(row.mpOrderId || '').trim()
  const app = String(row.applicantId || '').trim()
  if (mp && app) {
    if (isScheduleNotice(row)) return `sched-${mp}-${app}`
    return `sel-${mp}-${app}`
  }
  return String(row.id || '').trim()
}

function isSelectionNotice(row) {
  if (!row) return false
  if (row.noticeType === 'selection' || row.fromSelection) return true
  return /恭喜入选/.test(String(row.title || ''))
}

function isScheduleNotice(row) {
  if (!row) return false
  if (row.noticeType === 'schedule') return true
  return /探店排期/.test(String(row.title || ''))
}

function isVideoRejectNotice(row) {
  if (!row) return false
  if (row.noticeType === 'video_reject') return true
  return /探店视频需重新上传/.test(String(row.title || ''))
}

function getHandledAction(row) {
  const key = noticeActionKey(row)
  if (!key) return ''
  return String(readHandledMap()[key] || '')
}

function isPinned(row) {
  if (!row) return false
  if (isScheduleNotice(row)) return !getHandledAction(row)
  if (isSelectionNotice(row)) return !getHandledAction(row)
  if (isVideoRejectNotice(row) || row.pinned === true) return !row.read
  return false
}

function markHandled(row, action) {
  const key = noticeActionKey(row)
  if (!key) return
  const map = readHandledMap()
  map[key] = action === 'joined' ? 'joined' : 'confirmed'
  writeHandledMap(map)
}

function isSelectionPopupDismissed(row) {
  return !!getHandledAction(row)
}

function isSchedulePopupDismissed(row) {
  return !!getHandledAction(row)
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
  const isSel = isSelectionNotice(row)
  const isSched = isScheduleNotice(row)
  const read = !!row.read || ((isSel || isSched) && !!handled)
  const pinned = isPinned({ ...row, read })
  return {
    ...row,
    pinned,
    read,
    readLabel: read ? '已读' : '未读',
    showSelectionActions: isSel && pinned,
    showScheduleActions: isSched && pinned,
    handledAction: handled,
  }
}

module.exports = {
  HANDLED_KEY,
  noticeActionKey,
  isSelectionNotice,
  isScheduleNotice,
  isVideoRejectNotice,
  isPinned,
  getHandledAction,
  isSelectionPopupDismissed,
  isSchedulePopupDismissed,
  markHandled,
  exportHandledMapForSync,
  applyHandledMapFromSync,
  sortRows,
  enrichRow,
}
