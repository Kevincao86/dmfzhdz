/** 首页：待处理「PR 入选」通知弹窗（含群二维码） */

const messagesStore = require('./messagesStore.js')
const api = require('./api.js')
const talentMember = require('./talentMember.js')
const userProfile = require('./userProfile.js')
const inboxNoticeState = require('./inboxNoticeState.js')
const inboxCatalog = require('./inboxNoticeCatalog.js')
const appRegistrySync = require('./applicationsRegistrySync.js')
const talentInboxMatch = require('./talentInboxMatch.js')

function enrichRow(row) {
  return inboxCatalog.enrichNoticeRow(inboxNoticeState.enrichRow(row))
}

function normalizeSelectionRow(row) {
  if (!row) return null
  const mpOrderId = String(row.mpOrderId || '').trim()
  const applicantId = String(row.applicantId || '').trim()
  const dedupeKey =
    String(row.dedupeKey || '').trim() ||
    (mpOrderId && applicantId ? `sel-${mpOrderId}-${applicantId}` : '')
  return { ...row, mpOrderId, applicantId, dedupeKey }
}

function pickPendingSelection(rows) {
  const list = (rows || [])
    .map((r) => enrichRow(normalizeSelectionRow(r)))
    .filter((r) => {
      if (!r.showSelectionActions || inboxNoticeState.isSelectionPopupDismissed(r)) return false
      return !!String(r.imageUrl || '').trim()
    })
  if (!list.length) return null
  list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  return list[0]
}

async function loadPendingSelectionNotice() {
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
  return pickPendingSelection(rows)
}

function dismissSelectionNotice(row) {
  const normalized = normalizeSelectionRow(row)
  if (!normalized || !inboxNoticeState.noticeActionKey(normalized)) return
  inboxNoticeState.markHandled(normalized, 'confirmed')
  if (normalized.id) messagesStore.markInboxSeen([normalized.id])
  if (normalized.fromSelection && normalized.dedupeKey) {
    talentInboxMatch.markSelectionNoticeSent(normalized.dedupeKey)
  }
  try {
    wx.showToast({ title: '可在「我的-消息通知-入选」查看群码', icon: 'none', duration: 2500 })
  } catch (_) {}
}

function toPopupPayload(row) {
  const normalized = normalizeSelectionRow(row)
  if (!normalized) return null
  return {
    id: normalized.id,
    title: normalized.title || '恭喜入选招募',
    body: normalized.body || '您已被选入招募项目，请尽快扫码加入项目群。',
    imageUrl: normalized.imageUrl || '',
    dedupeKey: normalized.dedupeKey || '',
    fromSelection: !!normalized.fromSelection,
    mpOrderId: normalized.mpOrderId || '',
    applicantId: normalized.applicantId || '',
  }
}

module.exports = {
  loadPendingSelectionNotice,
  dismissSelectionNotice,
  toPopupPayload,
}
