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
    prDouyinLinkeBindings: prDouyinLinkeStore.readPrDouyinLinkeBindings(),
  }
}

function mergePublishedOrdersRemote(local, remote) {
  const localById = new Map(
    (local || []).map((item) => [String(item && item.mpOrderId ? item.mpOrderId : '').trim(), item]),
  )
  const out = []
  const seen = new Set()
  ;(remote || []).forEach((item) => {
    const id = String(item && item.mpOrderId ? item.mpOrderId : '').trim()
    if (!id) return
    seen.add(id)
    const localItem = localById.get(id)
    const deletedAt = (localItem && localItem.deletedAt) || item.deletedAt
    out.push(deletedAt ? { ...item, deletedAt } : item)
  })
  ;(local || []).forEach((item) => {
    const id = String(item && item.mpOrderId ? item.mpOrderId : '').trim()
    if (!id || seen.has(id)) return
    if (item.deletedAt) {
      seen.add(id)
      out.push(item)
    }
  })
  return out.slice(0, 80)
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
    writeJson(appKey, state.applications.slice(0, 80))
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
  pullAfterLogin,
  ensureClientStatePulled,
  resetSessionPullFlag,
}
