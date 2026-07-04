/**
 * 本机态云端同步：报名/发单/消息/模版/收藏/草稿（与履约 Web 共用 mp_account_client_state）
 */
const ecs = require('./ecs.js')
const sessionStore = require('./mpSessionStore.js')
const scope = require('./mpAccountLocalScope.js')
const memberStore = require('./talentMember.js')
const userProfile = require('./userProfile.js')
const applyTemplates = require('./applyFormTemplates.js')
const talentFavorites = require('./talentFavorites.js')
const orderFavorites = require('./orderFavorites.js')
const prDouyinLinkeStore = require('./prDouyinLinkeStore.js')
const mpGroupQr = require('./mpGroupQr.js')

const APPLICATIONS_BASE = 'meoo_my_applications_v1'
const PUBLISH_BASE = 'meoo_my_published_orders_v1'
const MSG_KEY = 'meoo_talent_messages_v1'
const NOTIFY_KEY = 'meoo_talent_notifications_v1'
const INBOX_SEEN_KEY = 'meoo_talent_inbox_seen_v1'
const inboxNoticeState = require('./inboxNoticeState.js')
const PUBLISH_DRAFTS_KEY = 'meoo_publish_wizard_drafts_v1'

let pushTimer = null
let syncing = false
let sessionPulled = false

function readJson(key, fallback) {
  try {
    const raw = wx.getStorageSync(key)
    if (!raw) return fallback
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw
    return j == null ? fallback : j
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  wx.setStorageSync(key, JSON.stringify(value))
}

function readList(key) {
  const list = readJson(key, [])
  return Array.isArray(list) ? list : []
}

function isLoggedIn() {
  return !!sessionStore.readSessionToken() && !!sessionStore.readAccount()
}

function authHeaders() {
  const token = sessionStore.readSessionToken()
  return token ? { 'X-Mp-Session': token } : {}
}

function collectLocalState() {
  const account = sessionStore.readAccount()
  const appKey = scope.scopedStorageKey(APPLICATIONS_BASE, account)
  const pubKey = scope.scopedStorageKey(PUBLISH_BASE, account)
  const notifyKey = scope.scopedStorageKey(NOTIFY_KEY, account)
  const msgKey = scope.scopedStorageKey(MSG_KEY, account)
  const inboxKey = scope.scopedStorageKey(INBOX_SEEN_KEY, account)
  const draftsKey = scope.scopedStorageKey(PUBLISH_DRAFTS_KEY, account)
  const member = memberStore.readMember()
  const pr = userProfile.readPrProfile()
  return {
    v: 1,
    talentMemberDraft: member || null,
    prProfileDraft: pr || null,
    applications: readList(appKey),
    publishedOrders: readList(pubKey),
    notifications: readList(notifyKey),
    messages: readList(msgKey),
    inboxSeen: readJson(inboxKey, []),
    selectionHandled: inboxNoticeState.exportHandledMapForSync(),
    publishWizardDrafts: readList(draftsKey),
    applyFormTemplates: applyTemplates.listAllTemplates(),
    activeApplyTemplateIds: applyTemplates.readActiveApplyTemplateIds(),
    talentFavoriteIds: [...talentFavorites.readIdSet()],
    orderFavoriteIds: [...orderFavorites.readIdSet()],
    groupQrCache: mpGroupQr.exportGroupQrCacheForSync(),
    prDouyinLinkeBindings: prDouyinLinkeStore.readPrDouyinLinkeBindings(),
  }
}

function parsePublishedOrderTime(raw) {
  const s = String(raw || '').trim()
  if (!s) return 0
  const iso = Date.parse(s.replace(/\//g, '-'))
  return Number.isFinite(iso) ? iso : 0
}

function publishedOrderMergeTime(row) {
  if (!row) return 0
  return Math.max(parsePublishedOrderTime(row.deletedAt), parsePublishedOrderTime(row.publishedAt))
}

function mergePublishedOrderPair(prev, row) {
  const newer = publishedOrderMergeTime(prev) >= publishedOrderMergeTime(row) ? prev : row
  const older = newer === prev ? row : prev
  const deletedAt = String((newer && newer.deletedAt) || (older && older.deletedAt) || '').trim()
  if (!deletedAt) return { ...newer }
  return { ...newer, ...older, deletedAt }
}

function mergePublishedOrdersRemote(local, remote) {
  const map = new Map()
  for (const row of [...(local || []), ...(remote || [])]) {
    if (!row || typeof row !== 'object') continue
    const id = String(row.mpOrderId || '').trim()
    if (!id) continue
    const prev = map.get(id)
    map.set(id, prev ? mergePublishedOrderPair(prev, row) : { ...row })
  }
  return [...map.values()]
    .sort((a, b) => publishedOrderMergeTime(b) - publishedOrderMergeTime(a))
    .slice(0, 80)
}

function parseApplicationAppliedAtMs(raw) {
  const s = String(raw || '').trim()
  if (!s) return 0
  const t = Date.parse(s.replace(/\//g, '-'))
  return Number.isFinite(t) ? t : 0
}

function applicationMergeTime(row) {
  if (!row || typeof row !== 'object') return 0
  return Math.max(parseApplicationAppliedAtMs(row.appliedAt), parseApplicationAppliedAtMs(row.withdrawnAt))
}

function mergeApplicationPair(prev, row) {
  const mpOrderId = String(row.mpOrderId || prev.mpOrderId || '').trim()
  const prevWithdrawn = String(prev.withdrawnAt || '').trim()
  const rowWithdrawn = String(row.withdrawnAt || '').trim()
  const rowApplicant = String(row.applicantId || '').trim()
  const prevApplicant = String(prev.applicantId || '').trim()

  if (rowApplicant && !rowWithdrawn && prevWithdrawn) {
    const rowMs = parseApplicationAppliedAtMs(row.appliedAt)
    const withdrawnMs = parseApplicationAppliedAtMs(prevWithdrawn)
    if (rowApplicant !== prevApplicant || rowMs > withdrawnMs) {
      const next = { ...prev, ...row, mpOrderId, applicantId: rowApplicant }
      delete next.withdrawnAt
      return next
    }
  }

  const withdrawnAt = prevWithdrawn || rowWithdrawn
  if (withdrawnAt) {
    const newer = applicationMergeTime(prev) >= applicationMergeTime(row) ? prev : row
    const older = newer === prev ? row : prev
    const next = { ...older, ...newer, mpOrderId, withdrawnAt }
    delete next.applicantId
    return next
  }

  const prevMs = parseApplicationAppliedAtMs(prev.appliedAt)
  const rowMs = parseApplicationAppliedAtMs(row.appliedAt)
  const newer = rowMs >= prevMs ? row : prev
  const older = newer === row ? prev : row
  const applicantId = String(newer.applicantId || older.applicantId || '').trim()
  return { ...older, ...newer, mpOrderId, applicantId }
}

function mergeApplicationsRemote(local, remote) {
  const map = new Map()
  for (const row of [...(local || []), ...(remote || [])]) {
    if (!row || typeof row !== 'object') continue
    const id = String(row.mpOrderId || '').trim()
    if (!id) continue
    const prev = map.get(id)
    map.set(id, prev ? mergeApplicationPair(prev, row) : { ...row, mpOrderId: id })
  }
  return [...map.values()]
    .sort((a, b) => applicationMergeTime(b) - applicationMergeTime(a))
    .slice(0, 80)
}

function applyRemoteState(state) {
  if (!state || typeof state !== 'object') return
  const account = sessionStore.readAccount()
  const appKey = scope.scopedStorageKey(APPLICATIONS_BASE, account)
  const pubKey = scope.scopedStorageKey(PUBLISH_BASE, account)

  if (state.talentMemberDraft) {
    console.warn('[mp] skip_talent_member_draft: use_registry_profile')
  }
  if (state.prProfileDraft) {
    console.warn('[mp] skip_pr_profile_draft: use_registry_profile')
  }
  if (Array.isArray(state.applications)) {
    const local = readList(appKey)
    writeJson(appKey, mergeApplicationsRemote(local, state.applications))
  }
  if (Array.isArray(state.publishedOrders)) {
    const local = readList(pubKey)
    writeJson(pubKey, mergePublishedOrdersRemote(local, state.publishedOrders))
  }
  const notifyKey = scope.scopedStorageKey(NOTIFY_KEY, account)
  const msgKey = scope.scopedStorageKey(MSG_KEY, account)
  const inboxKey = scope.scopedStorageKey(INBOX_SEEN_KEY, account)
  const draftsKey = scope.scopedStorageKey(PUBLISH_DRAFTS_KEY, account)
  if (Array.isArray(state.notifications)) {
    writeJson(notifyKey, state.notifications.slice(0, 100))
  }
  if (Array.isArray(state.messages)) {
    writeJson(msgKey, state.messages.slice(0, 100))
  }
  if (Array.isArray(state.inboxSeen)) {
    writeJson(inboxKey, state.inboxSeen.slice(-500))
  }
  if (state.selectionHandled && typeof state.selectionHandled === 'object') {
    inboxNoticeState.applyHandledMapFromSync(state.selectionHandled)
  }
  if (Array.isArray(state.publishWizardDrafts)) {
    writeJson(draftsKey, state.publishWizardDrafts.slice(0, 20))
  }
  if (Array.isArray(state.applyFormTemplates) || state.activeApplyTemplateIds) {
    applyTemplates.applyTemplatesFromSync(state.applyFormTemplates, state.activeApplyTemplateIds)
  }
  if (Array.isArray(state.talentFavoriteIds)) {
    talentFavorites.applyFavoriteIdsFromSync(state.talentFavoriteIds)
  }
  if (Array.isArray(state.orderFavoriteIds)) {
    orderFavorites.applyFavoriteIdsFromSync(state.orderFavoriteIds)
  }
  if (state.groupQrCache && typeof state.groupQrCache === 'object') {
    mpGroupQr.applyGroupQrCacheFromSync(state.groupQrCache)
  }
  if (state.prDouyinLinkeBindings) {
    prDouyinLinkeStore.applyPrDouyinLinkeBindingsFromSync(state.prDouyinLinkeBindings)
  }
}

async function syncWithServer() {
  if (!isLoggedIn() || syncing) return null
  syncing = true
  try {
    const data = await ecs.post(
      '/api/meoo-ops-mp-auth',
      { action: 'client_state_sync', state: collectLocalState() },
      authHeaders(),
    )
    if (data && data.state) applyRemoteState(data.state)
    return data
  } catch (e) {
    console.warn('[mp] client_state_sync', String(e && e.message ? e.message : e).slice(0, 120))
    return null
  } finally {
    syncing = false
  }
}

function schedulePush(delayMs) {
  if (!isLoggedIn()) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void syncWithServer()
  }, delayMs == null ? 1500 : delayMs)
}

async function flushClientStateSync() {
  if (!isLoggedIn()) return null
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
  return syncWithServer()
}

function resetSessionPullFlag() {
  sessionPulled = false
}

async function ensureClientStatePulled() {
  if (!isLoggedIn()) return null
  if (sessionPulled) return null
  return pullAfterLogin()
}

async function pullAfterLogin() {
  if (!isLoggedIn()) return Promise.resolve(null)
  const data = await syncWithServer()
  sessionPulled = true
  return data
}

module.exports = {
  collectLocalState,
  applyRemoteState,
  syncWithServer,
  schedulePush,
  flushClientStateSync,
  pullAfterLogin,
  ensureClientStatePulled,
  resetSessionPullFlag,
}
