const chat = require('./talentChat.js')
const participant = require('./participant.js')
const talentMember = require('./talentMember.js')
const userProfile = require('./userProfile.js')

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
    if (!page) continue
    try {
      const { resolveTabBar: resolvePageTabBar } = require('./tabBar.js')
      const bar = resolvePageTabBar(page)
      if (bar) return bar
    } catch (_) {}
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

/** 从服务端拉取未读并更新 Tab 角标（任意页面后台轮询） */
async function refreshNow(options) {
  if (refreshing) return getAppSafe()?.globalData?.chatBadge || 0
  const opts = options || {}
  const bar = resolveTabBar()

  if (!chat.canChat()) {
    applyBadgeToBar(bar, 0)
    return 0
  }

  if (typeof opts.explicitCount === 'number') {
    applyBadgeToBar(bar, opts.explicitCount)
    return opts.explicitCount
  }

  refreshing = true
  try {
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
    applyBadgeToBar(bar, count)
    return count
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
  const member = talentMember.readMember()
  const pr = userProfile.readPrProfile()
  if (!member && !pr) return
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
