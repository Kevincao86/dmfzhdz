/** 首页：待处理「探店排期」通知弹窗 */

const messagesStore = require('./messagesStore.js')
const api = require('./api.js')
const talentMember = require('./talentMember.js')
const userProfile = require('./userProfile.js')
const inboxNoticeState = require('./inboxNoticeState.js')
const inboxCatalog = require('./inboxNoticeCatalog.js')
const appRegistrySync = require('./applicationsRegistrySync.js')

function enrichRow(row) {
  return inboxCatalog.enrichNoticeRow(inboxNoticeState.enrichRow(row))
}

function normalizeScheduleRow(row) {
  if (!row) return null
  const mpOrderId = String(row.mpOrderId || '').trim()
  const applicantId = String(row.applicantId || '').trim()
  const dedupeKey =
    String(row.dedupeKey || '').trim() ||
    (mpOrderId && applicantId ? `sched-${mpOrderId}-${applicantId}` : '')
  return { ...row, mpOrderId, applicantId, dedupeKey }
}

function pickPendingSchedule(rows) {
  const list = (rows || [])
    .map((r) => enrichRow(normalizeScheduleRow(r)))
    .filter((r) => r.showScheduleActions && !inboxNoticeState.isSchedulePopupDismissed(r))
  if (!list.length) return null
  list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  return list[0]
}

async function loadPendingScheduleNotice() {
  if (userProfile.readIdentity() !== 'talent') return null
  const member = talentMember.readMember()
  if (!member || (!member.id && !member.contact)) return null

  let rows = messagesStore.readNotifications()
  if (api.hasApi()) {
    try {
      const reg = await appRegistrySync.fetchRegistryAndReconcileApplications({ includeLocalContext: true })
      rows = messagesStore.mergeRegistryInboxForTalent(reg, member)
    } catch (_) {
      rows = inboxNoticeState.sortRows(rows.map(enrichRow))
    }
  } else {
    rows = inboxNoticeState.sortRows(rows.map(enrichRow))
  }
  return pickPendingSchedule(rows)
}

function dismissScheduleNotice(row) {
  const normalized = normalizeScheduleRow(row)
  if (!normalized || !inboxNoticeState.noticeActionKey(normalized)) return
  inboxNoticeState.markHandled(normalized, 'confirmed')
  if (normalized.id) messagesStore.markInboxSeen([normalized.id])
  try {
    wx.showToast({ title: '可在「我的-消息通知」查看排期', icon: 'none', duration: 2500 })
  } catch (_) {}
}

function toPopupPayload(row) {
  const normalized = normalizeScheduleRow(row)
  if (!normalized) return null
  return {
    kind: 'schedule',
    id: normalized.id,
    title: normalized.title || '探店排期已确认',
    body: normalized.body || '请按排期时间到店探店。',
    dedupeKey: normalized.dedupeKey || '',
    mpOrderId: normalized.mpOrderId || '',
    applicantId: normalized.applicantId || '',
  }
}

module.exports = {
  loadPendingScheduleNotice,
  dismissScheduleNotice,
  toPopupPayload,
}
