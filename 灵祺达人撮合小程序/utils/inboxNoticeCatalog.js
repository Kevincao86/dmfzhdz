const inboxNoticeState = require('./inboxNoticeState.js')

const KIND_LABELS = {
  selection: '入选',
  order: '订单',
  business: '业务',
  system: '系统',
}

const DETAIL_STORAGE_KEY = 'meoo_ntf_detail_row_v1'

function isSelectionNotice(row) {
  if (!row) return false
  return inboxNoticeState.isSelectionNotice(row)
}

function resolveNoticeKind(row) {
  if (isSelectionNotice(row)) return 'selection'
  if (row && row.noticeType === 'ops_broadcast') return 'system'
  const mp = String(row.mpOrderId || '').trim()
  const app = String(row.applicantId || '').trim()
  if (mp && app && /恭喜入选|已被选入|PR 选入/.test(`${row.title || ''}${row.body || ''}`)) {
    return 'selection'
  }
  const c = row && row.category
  if (c === 'order' || c === 'business' || c === 'system') return c
  return 'system'
}

function resolveDetailTarget(row) {
  if (!row) return null
  const mp = String(row.mpOrderId || '').trim()
  if (mp) {
    const applied = !!(row.applicantId || isSelectionNotice(row))
    return {
      type: 'order',
      url: `/pages/detail/detail?id=${encodeURIComponent(mp)}${applied ? '&applied=1' : ''}`,
      label: isSelectionNotice(row) ? '查看入选商单' : '查看关联商单',
    }
  }
  const body = String(row.body || '').trim()
  const title = String(row.title || '').trim()
  if (body.length > 40 || title.length > 24 || row.imageUrl) {
    return { type: 'detail_page', label: '查看详情' }
  }
  return null
}

function canOpenDetail(row) {
  return !!resolveDetailTarget(row)
}

function enrichNoticeRow(row) {
  const kind = resolveNoticeKind(row)
  const target = resolveDetailTarget(row)
  return {
    ...row,
    noticeKind: kind,
    noticeKindLabel: KIND_LABELS[kind] || KIND_LABELS.system,
    canOpenDetail: !!target,
    detailLabel: target ? target.label : '',
    detailTargetType: target ? target.type : '',
    detailUrl: target && target.url ? target.url : '',
  }
}

function tabCounts(rows) {
  const counts = { all: (rows || []).length, selection: 0, order: 0, business: 0, system: 0 }
  for (let i = 0; i < (rows || []).length; i++) {
    const k = resolveNoticeKind(rows[i])
    if (counts[k] != null) counts[k]++
  }
  return counts
}

function filterByTab(rows, tabId) {
  if (!tabId || tabId === 'all') return rows || []
  return (rows || []).filter((r) => resolveNoticeKind(r) === tabId)
}

function writeDetailPayload(row) {
  try {
    wx.setStorageSync(DETAIL_STORAGE_KEY, JSON.stringify(row || {}))
  } catch (_) {}
}

function readDetailPayload() {
  try {
    const raw = wx.getStorageSync(DETAIL_STORAGE_KEY)
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw
    return o && typeof o === 'object' ? o : null
  } catch {
    return null
  }
}

function clearDetailPayload() {
  try {
    wx.removeStorageSync(DETAIL_STORAGE_KEY)
  } catch (_) {}
}

module.exports = {
  KIND_LABELS,
  DETAIL_STORAGE_KEY,
  isSelectionNotice,
  resolveNoticeKind,
  resolveDetailTarget,
  canOpenDetail,
  enrichNoticeRow,
  tabCounts,
  filterByTab,
  writeDetailPayload,
  readDetailPayload,
  clearDetailPayload,
}
