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

function pickPendingSelection(rows) {
  const list = (rows || []).map(enrichRow).filter((r) => r.showSelectionActions)
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
  if (!row || !row.id) return
  inboxNoticeState.markHandled(row, 'confirmed')
  messagesStore.markInboxSeen([row.id])
  if (row.fromSelection && row.dedupeKey) {
    talentInboxMatch.markSelectionNoticeSent(row.dedupeKey)
  }
}

function toPopupPayload(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title || '恭喜入选招募',
    body: row.body || '您已被选入招募项目，请尽快扫码加入项目群。',
    imageUrl: row.imageUrl || '',
    dedupeKey: row.dedupeKey || '',
    fromSelection: !!row.fromSelection,
    mpOrderId: row.mpOrderId || '',
    applicantId: row.applicantId || '',
  }
}

module.exports = {
  loadPendingSelectionNotice,
  dismissSelectionNotice,
  toPopupPayload,
}
