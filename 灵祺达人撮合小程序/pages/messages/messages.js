const chat = require('../../utils/talentChat.js')
const participant = require('../../utils/participant.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const userProfile = require('../../utils/userProfile.js')
const config = require('../../utils/config.js')
const { applyCapsulePadding } = require('../../utils/navLayout.js')
const { setTabBarForPage, refreshChatTabBadge } = require('../../utils/tabBar.js')

Page({
  data: {
    recHeadBandStyle: '',
    recHeadInnerStyle: '',
    configured: false,
    loading: true,
    refreshing: false,
    err: '',
    searchKeyword: '',
    allSessions: [],
    sessions: [],
    identityHint: '',
    emptyTitle: '暂无会话',
    emptyHint: '',
    showDevTest: false,
  },
  onLoad() {
    applyCapsulePadding(this, null, { band: 'recHeadBandStyle', right: 'recHeadInnerStyle' })
    this.setData({ showDevTest: !!config.MP_CHAT_DEV_TEST })
    this.applyIdentityCopy()
  },
  onShow() {
    setTabBarForPage(this, '/pages/messages/messages')
    applyCapsulePadding(this, null, { band: 'recHeadBandStyle', right: 'recHeadInnerStyle' })
    participant.clearParticipantOverride()
    this.applyIdentityCopy()
    void this.bootstrap()
  },
  applyIdentityCopy() {
    const id = userProfile.readIdentity()
    if (id === 'pr') {
      this.setData({
        identityHint: 'PR · 与达人私信',
        emptyTitle: '暂无达人会话',
        emptyHint: '在「推荐大厅」页点击「沟通」向达人发起私信',
      })
    } else {
      this.setData({
        identityHint: '达人 · 与招募方私信',
        emptyTitle: '暂无招募方会话',
        emptyHint: 'PR 审核通过您的报名后，可在商单详情「联系招募方」',
      })
    }
  },
  async bootstrap() {
    if (!chat.canChat()) {
      this.setData({ configured: false, loading: false, sessions: [], allSessions: [] })
      refreshChatTabBadge(this, 0)
      return
    }
    this.setData({ configured: true, loading: !this.data.refreshing, err: '' })
    try {
      try {
        await chat.syncProfile()
      } catch (syncErr) {
        console.warn('[messages] syncProfile', syncErr)
      }
      let reg = null
      try {
        reg = await ops.fetchRegistry()
      } catch (_) {
        /* */
      }
      this._registryForChat = reg
      const rows = await chat.listSessionsForMe()
      const me = participant.getCurrentParticipant()
      const sessions = rows.map((s) => {
        const authKey = chat.sessionAuthKeyForMe(s, me)
        return this.mapSession(s, authKey, reg)
      })
      let unread = 0
      for (let i = 0; i < rows.length; i++) {
        unread += participant.unreadForMe(rows[i], chat.sessionAuthKeyForMe(rows[i], me))
      }
      this.setData({ allSessions: sessions, loading: false, refreshing: false })
      this.applySearch()
      refreshChatTabBadge(this, unread)
    } catch (e) {
      this.setData({
        loading: false,
        refreshing: false,
        err: chat.formatChatError(e),
        sessions: [],
        allSessions: [],
      })
      refreshChatTabBadge(this, 0)
    }
  },
  onPullRefresh() {
    this.setData({ refreshing: true })
    void this.bootstrap()
  },
  mapSession(s, myKey, reg) {
    const peer = chat.sessionPeerFromRow(s, myKey, reg || this._registryForChat)
    return {
      id: s.id,
      peerName: peer.name,
      peerId: peer.peerId || '',
      peerAvatar: peer.avatar,
      lastText: s.last_text || '',
      timeText: chat.sessionPreviewTime(s.last_ts),
      unread: participant.unreadForMe(s, myKey),
      talent_key: s.talent_key,
      pr_key: s.pr_key,
    }
  },
  applySearch() {
    const kw = String(this.data.searchKeyword || '').trim().toLowerCase()
    const sessions = kw
      ? this.data.allSessions.filter((s) => {
          const blob = [s.peerName, s.peerId, s.lastText].join(' ').toLowerCase()
          return blob.includes(kw)
        })
      : this.data.allSessions
    this.setData({ sessions })
  },
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
    this.applySearch()
  },
  openChat(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || '会话'
    const peerId = e.currentTarget.dataset.peerId || ''
    const avatar = e.currentTarget.dataset.avatar || ''
    if (!id) return
    wx.navigateTo({
      url:
        `/pages/chat/chat?sessionId=${encodeURIComponent(id)}` +
        `&peerName=${encodeURIComponent(name)}` +
        `&peerId=${encodeURIComponent(peerId)}` +
        `&peerAvatar=${encodeURIComponent(avatar)}`,
    })
  },
  async openTestDialog() {
    wx.showLoading({ title: '进入对话' })
    try {
      const r = await chat.openTestChatDialog()
      wx.hideLoading()
      wx.navigateTo({
        url:
          `/pages/chat/chat?sessionId=${encodeURIComponent(r.sessionId)}` +
          `&peerName=${encodeURIComponent(r.peerName)}` +
          `&peerAvatar=${encodeURIComponent(r.peerAvatar)}&devTest=1`,
      })
    } catch (e) {
      wx.hideLoading()
      wx.showModal({
        title: '无法打开测试对话',
        content: String(e.message || e),
        showCancel: false,
      })
    }
  },
})
