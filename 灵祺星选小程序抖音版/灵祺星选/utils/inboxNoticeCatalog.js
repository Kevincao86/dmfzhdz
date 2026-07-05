const inboxNoticeState = require('./inboxNoticeState.js')
const richContentMp = require('./richContentMp.js')

const KIND_LABELS = {
  selection: '入选',
  order: '订单',
  business: '业务',
  system: '系统',
}

const DETAIL_STORAGE_KEY = 'meoo_ntf_detail_row_v1'
const ORDER_DETAIL_PATH = '/pages/detail/detail'
const ORDER_GROUP_CHAT_PATH = '/pages/order-group-chat/order-group-chat'

function isOrderGroupChatNotice(row) {
  const title = String((row && row.title) || '').trim()
  const body = String((row && row.body) || '').trim()
  return title === '商单协作群已创建' || /点击进入群聊/.test(body)
}

function isTargetedInviteNotice(row) {
  return String((row && row.title) || '').trim() === '定向合作邀约'
}

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
  if (inboxNoticeState.isVideoRejectNotice(row)) {
    let url = '/pages/mine-applications/mine-applications?tab=pending_video&displayStatus=video_rejected'
    if (mp) url += `&mpOrderId=${encodeURIComponent(mp)}`
    return { type: 'applications', url, label: '去重新上传视频' }
  }
  if (inboxNoticeState.isScriptRejectNotice(row)) {
    let url = '/pages/mine-applications/mine-applications?tab=pending_video&displayStatus=script_rejected&platformGroup=script'
    if (mp) url += `&mpOrderId=${encodeURIComponent(mp)}`
    return { type: 'applications', url, label: '去重新提交文稿' }
  }
  if (mp) {
    if (isOrderGroupChatNotice(row)) {
      return {
        type: 'group_chat',
        url: `${ORDER_GROUP_CHAT_PATH}?mpOrderId=${encodeURIComponent(mp)}`,
        label: '进入群聊',
      }
    }
    if (isTargetedInviteNotice(row)) {
      return {
        type: 'targeted_invite',
        url: `${ORDER_DETAIL_PATH}?id=${encodeURIComponent(mp)}&targetedInvite=1`,
        label: '查看邀约详情',
      }
    }
    const applied = !!(row.applicantId || isSelectionNotice(row))
    return {
      type: 'order',
      url: `${ORDER_DETAIL_PATH}?id=${encodeURIComponent(mp)}${applied ? '&applied=1' : ''}`,
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
  const body = String(row.body || '')
  const bodyHtml = richContentMp.richContentToHtml(body)
  const bodyPreview = richContentMp.richContentPlainPreview(body, 120)
  return {
    ...row,
    bodyHtml,
    bodyPreview,
    noticeKind: kind,
    noticeKindLabel: KIND_LABELS[kind] || KIND_LABELS.system,
    canOpenDetail: !!target,
    detailLabel: target ? target.label : '',
    detailTargetType: target ? target.type : '',
    detailUrl: target && target.url ? target.url : '',
  }
}

function tabCounts(rows) {
  const counts = { all: 0, selection: 0, order: 0, business: 0, system: 0 }
  for (let i = 0; i < (rows || []).length; i++) {
    const r = rows[i]
    if (!r || r.read) continue
    counts.all++
    const k = resolveNoticeKind(r)
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
