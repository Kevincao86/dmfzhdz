/** 首页：运营台批量公告弹窗 */

const messagesStore = require('./messagesStore.js')
const api = require('./api.js')
const talentMember = require('./talentMember.js')
const userProfile = require('./userProfile.js')
const inboxNoticeState = require('./inboxNoticeState.js')
const inboxCatalog = require('./inboxNoticeCatalog.js')
const appRegistrySync = require('./applicationsRegistrySync.js')
const registryProfileSync = require('./registryProfileSync.js')

function enrichRow(row) {
  return inboxCatalog.enrichNoticeRow(inboxNoticeState.enrichRow(row))
}

function normalizeOpsBroadcastRow(row) {
  if (!row) return null
  const announcementId = String(row.announcementId || '').trim()
  const dedupeKey =
    String(row.dedupeKey || '').trim() ||
    (announcementId ? `ops-ann-${announcementId}` : String(row.id || '').trim())
  return { ...row, announcementId, dedupeKey }
}

function pickPendingOpsBroadcast(rows) {
  const list = (rows || [])
    .map((r) => enrichRow(normalizeOpsBroadcastRow(r)))
    .filter((r) => r.showOpsBroadcastActions && !inboxNoticeState.isOpsBroadcastPopupDismissed(r))
  if (!list.length) return null
  list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  return list[0]
}

async function loadPendingOpsBroadcastNotice() {
  if (userProfile.readIdentity() !== 'talent') return null
  const member = talentMember.readMember()
  if (!member || (!member.id && !member.contact)) return null

  let rows = messagesStore.readNotifications()
  if (api.hasApi()) {
    try {
      await registryProfileSync.pullRegistryProfileAfterLogin()
      const reg = await appRegistrySync.fetchRegistryAndReconcileApplications({ includeLocalContext: true })
      rows = messagesStore.mergeRegistryInboxForTalent(reg, member)
    } catch (_) {
      rows = inboxNoticeState.sortRows(rows.map(enrichRow))
    }
  } else {
    rows = inboxNoticeState.sortRows(rows.map(enrichRow))
  }
  return pickPendingOpsBroadcast(rows)
}

function dismissOpsBroadcastNotice(row) {
  const normalized = normalizeOpsBroadcastRow(row)
  if (!normalized || !inboxNoticeState.noticeActionKey(normalized)) return
  inboxNoticeState.markHandled(normalized, 'confirmed')
  if (normalized.id) messagesStore.markInboxSeen([normalized.id])
  try {
    wx.showToast({ title: '可在「我的-消息通知-系统」查看', icon: 'none', duration: 2500 })
  } catch (_) {}
}

function toPopupPayload(row) {
  const normalized = normalizeOpsBroadcastRow(row)
  if (!normalized) return null
  return {
    kind: 'ops_broadcast',
    id: normalized.id,
    title: normalized.title || '平台公告',
    body: normalized.body || '',
    dedupeKey: normalized.dedupeKey || '',
    announcementId: normalized.announcementId || '',
  }
}

module.exports = {
  loadPendingOpsBroadcastNotice,
  dismissOpsBroadcastNotice,
  toPopupPayload,
}
