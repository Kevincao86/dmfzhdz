/**
 * 本机态云端同步：资料草稿、报名/发单列表、消息通知（与履约 Web 共用 mp_account_client_state）
 */
const ecs = require('./ecs.js')
const sessionStore = require('./mpSessionStore.js')
const scope = require('./mpAccountLocalScope.js')
const clientStateGuard = require('./mpClientStateGuard.js')
const memberStore = require('./talentMember.js')
const userProfile = require('./userProfile.js')

const APPLICATIONS_BASE = 'meoo_my_applications_v1'
const PUBLISH_BASE = 'meoo_my_published_orders_v1'
const MSG_KEY = 'meoo_talent_messages_v1'
const NOTIFY_KEY = 'meoo_talent_notifications_v1'
const INBOX_SEEN_KEY = 'meoo_talent_inbox_seen_v1'
const TALENT_MEMBER_KEY = 'meoo_talent_member_v1'
const PR_PROFILE_KEY = 'meoo_pr_profile_v1'

let pushTimer = null
let syncing = false

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
  }
}

function applyRemoteState(state) {
  if (!state || typeof state !== 'object') return
  const account = sessionStore.readAccount()
  const appKey = scope.scopedStorageKey(APPLICATIONS_BASE, account)
  const pubKey = scope.scopedStorageKey(PUBLISH_BASE, account)

  if (
    state.talentMemberDraft &&
    typeof state.talentMemberDraft === 'object' &&
    clientStateGuard.talentDraftBelongsToAccount(state.talentMemberDraft, account)
  ) {
    memberStore.writeMember(state.talentMemberDraft)
  } else if (state.talentMemberDraft) {
    console.warn('[mp] skip_talent_member_draft: account_mismatch')
  }
  if (
    state.prProfileDraft &&
    typeof state.prProfileDraft === 'object' &&
    clientStateGuard.prDraftBelongsToAccount(state.prProfileDraft, account)
  ) {
    userProfile.writePrProfile(state.prProfileDraft)
  } else if (state.prProfileDraft) {
    console.warn('[mp] skip_pr_profile_draft: account_mismatch')
  }
  if (Array.isArray(state.applications)) {
    writeJson(appKey, state.applications.slice(0, 80))
  }
  if (Array.isArray(state.publishedOrders)) {
    writeJson(pubKey, state.publishedOrders.slice(0, 80))
  }
  const notifyKey = scope.scopedStorageKey(NOTIFY_KEY, account)
  const msgKey = scope.scopedStorageKey(MSG_KEY, account)
  const inboxKey = scope.scopedStorageKey(INBOX_SEEN_KEY, account)
  if (Array.isArray(state.notifications)) {
    writeJson(notifyKey, state.notifications.slice(0, 100))
  }
  if (Array.isArray(state.messages)) {
    writeJson(msgKey, state.messages.slice(0, 100))
  }
  if (Array.isArray(state.inboxSeen)) {
    writeJson(inboxKey, state.inboxSeen.slice(-500))
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

function pullAfterLogin() {
  if (!isLoggedIn()) return Promise.resolve(null)
  return syncWithServer()
}

module.exports = {
  collectLocalState,
  applyRemoteState,
  syncWithServer,
  schedulePush,
  pullAfterLogin,
}
