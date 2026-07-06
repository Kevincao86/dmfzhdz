const chat = require('./talentChat.js')
const participant = require('./participant.js')
const talentMember = require('./talentMember.js')
const userProfile = require('./userProfile.js')
const messagesStore = require('./messagesStore.js')
const api = require('./api.js')
const registryCache = require('./registryCache.js')
const mpOrderGroupChatApi = require('./mpOrderGroupChatApi.js')
const groupReadState = require('./mpOrderGroupChatReadState.js')

const POLL_MS = chat.POLL_MS || 2500

let pollTimer = null
let refreshing = false

function getAppSafe() {
  try {
    return getApp()
  } catch {
    return null
  }
}

function setGlobalBadge(count) {
  const app = getAppSafe()
  if (app) {
    if (!app.globalData) app.globalData = {}
    app.globalData.chatBadge = count
  }
}

function resolveTabBar() {
  const pages = getCurrentPages()
  for (let i = pages.length - 1; i >= 0; i--) {
    const page = pages[i]
    if (page && typeof page.getTabBar === 'function') {
      const bar = page.getTabBar()
      if (bar) return bar
    }
  }
  return null
}

function applyBadgeToBar(bar, count) {
  const badge = count > 0 ? count : 0
  setGlobalBadge(badge)
  if (bar && bar.data && bar.data.chatBadge !== badge) {
    bar.setData({ chatBadge: badge })
  }
}

function hasMessageIdentity() {
  const member = talentMember.readMember()
  const pr = userProfile.readPrProfile()
  return !!(member || pr)
}

async function countChatUnread(options) {
  const opts = options || {}
  if (!chat.canChat()) return 0
  if (opts.clearOverride) participant.clearParticipantOverride()
  try {
    await chat.syncProfile()
  } catch (syncErr) {
    console.warn('[chatBadgeWatcher] syncProfile', syncErr)
  }
  const me = participant.getCurrentParticipant()
  const rows = await chat.listSessionsForMe(me)
  let count = 0
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i]
    count += participant.unreadForMe(s, chat.sessionAuthKeyForMe(s, me))
  }
  return count
}

async function countNotificationUnread() {
  let rows = messagesStore.readNotifications()
  if (userProfile.readIdentity() === 'talent' && api.hasApi()) {
    const member = talentMember.readMember()
    if (member && (member.id || member.contact)) {
      const cached = registryCache.load({ allowStale: true })
      const reg = cached && cached.data ? cached.data : null
      if (reg) {
        try {
          rows = messagesStore.mergeRegistryInboxForTalent(reg, member)
        } catch (_) {
          /* 使用本地通知 */
        }
      }
    }
  }
  return messagesStore.unreadNotificationCount(rows)
}

async function countGroupUnread() {
  if (!api.hasApi()) return 0
  try {
    const body = await mpOrderGroupChatApi.listMine()
    const groups = body && Array.isArray(body.groups) ? body.groups : []
    return groupReadState.totalUnread(groups, mpOrderGroupChatApi.myParticipantKey())
  } catch (e) {
    console.warn('[chatBadgeWatcher] group unread', e)
    return 0
  }
}

/** 从服务端拉取未读并更新 Tab 角标（系统通知 + 私信 + 群聊合计） */
async function refreshNow(options) {
  if (refreshing) return getAppSafe()?.globalData?.chatBadge || 0
  const opts = options || {}
  const bar = resolveTabBar()

  if (typeof opts.explicitCount === 'number') {
    applyBadgeToBar(bar, opts.explicitCount)
    return opts.explicitCount
  }

  if (!hasMessageIdentity()) {
    applyBadgeToBar(bar, 0)
    return 0
  }

  refreshing = true
  try {
    const [chatCount, ntfCount, groupCount] = await Promise.all([
      countChatUnread(opts),
      countNotificationUnread(),
      countGroupUnread(),
    ])
    const total = chatCount + ntfCount + groupCount
    applyBadgeToBar(bar, total)
    return total
  } catch (e) {
    console.warn('[chatBadgeWatcher] refresh', e)
    return getAppSafe()?.globalData?.chatBadge || 0
  } finally {
    refreshing = false
  }
}

function syncBarFromGlobal() {
  const app = getAppSafe()
  const count = app && app.globalData ? app.globalData.chatBadge : 0
  const bar = resolveTabBar()
  if (bar) applyBadgeToBar(bar, count || 0)
}

function start() {
  stop()
  if (!hasMessageIdentity()) return
  void refreshNow()
  pollTimer = setInterval(() => {
    void refreshNow()
  }, POLL_MS)
}

function stop() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

module.exports = {
  POLL_MS,
  refreshNow,
  syncBarFromGlobal,
  start,
  stop,
}
