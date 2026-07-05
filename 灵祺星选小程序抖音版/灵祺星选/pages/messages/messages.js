const chat = require('../../utils/talentChat.js')
const participant = require('../../utils/participant.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const userProfile = require('../../utils/userProfile.js')
const config = require('../../utils/config.js')
const { applyCapsulePadding } = require('../../utils/navLayout.js')
const { setTabBarForPage, refreshChatTabBadge } = require('../../utils/tabBar.js')
const mpShare = require('../../utils/mpShare.js')
const wxProfileDisplay = require('../../utils/wxProfileDisplay.js')
const messagesStore = require('../../utils/messagesStore.js')
const inboxCatalog = require('../../utils/inboxNoticeCatalog.js')
const inboxNoticeState = require('../../utils/inboxNoticeState.js')
const talentInboxMatch = require('../../utils/talentInboxMatch.js')
const ntfPage = require('../../utils/notificationInboxPage.js')
const mpOrderGroupChatApi = require('../../utils/mpOrderGroupChatApi.js')
const api = require('../../utils/api.js')

const MSG_TABS = [
  { id: 'all', label: '全部' },
  { id: 'system', label: '系统通知' },
  { id: 'chat', label: '私信' },
  { id: 'group', label: '群聊' },
]

Page({
  behaviors: [require('../../behaviors/identityTheme')],
  data: {
    recHeadBandStyle: '',
    recHeadInnerStyle: '',
    chatConfigured: false,
    loading: true,
    refreshing: false,
    err: '',
    searchKeyword: '',
    allSessions: [],
    sessions: [],
    allGroupSessions: [],
    groupSessions: [],
    groupEmptyTitle: '暂无商单群',
    groupEmptyHint: 'PR 一键拉群后，商单协作群会显示在这里',
    identityHint: '',
    emptyTitle: '暂无会话',
    emptyHint: '',
    showDevTest: false,
    msgTabs: MSG_TABS,
    msgTab: 'all',
    ntfTabs: [],
    ntfActiveTab: 'all',
    ntfSections: [],
    ntfTotalCount: 0,
    ntfUnreadCount: 0,
    ntfEmptyHint: '',
  },
  onLoad() {
    applyCapsulePadding(this, null, { band: 'recHeadBandStyle', right: 'recHeadInnerStyle' })
    this.setData({ showDevTest: !!config.MP_CHAT_DEV_TEST })
    this.applyIdentityCopy()
  },
  onShareAppMessage() {
    mpShare.enableShareMenu()
    return mpShare.defaultShare('/pages/messages/messages')
  },
  onShareTimeline() {
    return mpShare.defaultTimelineShare()
  },
  onShow() {
    mpShare.enableShareMenu()
    setTabBarForPage(this, '/pages/messages/messages')
    require('../../utils/identityTheme.js').applyTabHomeChrome()
    applyCapsulePadding(this, null, { band: 'recHeadBandStyle', right: 'recHeadInnerStyle' })
    participant.clearParticipantOverride()
    this.applyIdentityCopy()
    if (this._suppressShowReload) {
      this._suppressShowReload = false
      return
    }
    if (!this._messagesBootstrapped) {
      void this.bootstrap()
    } else if (chat.canChat()) {
      void this.reloadChatSessionsQuiet()
    }
    if (this._messagesBootstrapped && api.hasApi()) {
      void this.loadGroupSessions().then(() => {
        if (this.data.msgTab === 'group') this.applySearch()
      })
    }
  },
  async reloadChatSessionsQuiet() {
    if (!chat.canChat()) return
    try {
      await this.loadChatSessions()
      this.applySearch()
    } catch (e) {
      console.warn('[messages] reloadChatSessionsQuiet', e)
    }
  },
  applyIdentityCopy() {
    const id = userProfile.readIdentity()
    if (id === 'pr') {
      this.setData({
        identityHint: 'PR · 与达人私信',
        emptyTitle: '暂无达人会话',
        emptyHint: '在「推荐大厅」页点击「沟通」向达人发起私信',
        groupEmptyHint: '在报名管理或定向邀约中「一键拉群」后，商单群会显示在这里',
      })
    } else {
      this.setData({
        identityHint: '达人 · 与招募方私信',
        emptyTitle: '暂无招募方会话',
        emptyHint: 'PR 审核通过您的报名后，可在商单详情「联系招募方」',
        groupEmptyHint: '被邀请加入商单群后，会显示在这里',
      })
    }
  },
  async bootstrap() {
    this.setData({ loading: !this.data.refreshing, err: '' })
    try {
      await this.loadNotifications()
      if (chat.canChat()) {
        await this.loadChatSessions()
      } else {
        this.setData({ chatConfigured: false, allSessions: [], sessions: [] })
        refreshChatTabBadge(this, 0)
      }
      if (api.hasApi()) {
        await this.loadGroupSessions()
      } else {
        this.setData({ allGroupSessions: [], groupSessions: [] })
      }
      this.applySearch()
      this.setData({ loading: false, refreshing: false })
      this._messagesBootstrapped = true
    } catch (e) {
      this.setData({
        loading: false,
        refreshing: false,
        err: String(e && e.message ? e.message : e).slice(0, 120) || '加载失败',
      })
    }
  },
  async loadNotifications() {
    const rows = await ntfPage.fetchNotificationRows()
    this.reapplyNtfView(rows)
  },
  reapplyNtfView(rows) {
    this._ntfRows = rows
    this.setData({
      ...ntfPage.patchFromRows(rows, this.data.ntfActiveTab),
    })
  },
  enrichNtfRow(row) {
    return inboxCatalog.enrichNoticeRow(inboxNoticeState.enrichRow(row))
  },
  async loadChatSessions() {
    this.setData({ chatConfigured: true })
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
    this.setData({ allSessions: sessions })
    refreshChatTabBadge(this, unread)
  },
  async loadGroupSessions() {
    try {
      const body = await mpOrderGroupChatApi.listMine()
      const sessions = mpOrderGroupChatApi.mapGroupSessions(body && body.groups)
      this.setData({ allGroupSessions: sessions })
    } catch (e) {
      console.warn('[messages] loadGroupSessions', e)
      this.setData({ allGroupSessions: [] })
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
      peerAvatar: wxProfileDisplay.sanitizeDisplayAvatar(peer.avatar),
      lastText: s.last_text || '',
      timeText: chat.sessionPreviewTime(s.last_ts),
      unread: participant.unreadForMe(s, myKey),
      talent_key: s.talent_key,
      pr_key: s.pr_key,
    }
  },
  onMsgTab(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({ msgTab: id })
    if (id === 'group' && !(this.data.allGroupSessions || []).length) {
      void this.loadGroupSessions().then(() => this.applySearch())
      return
    }
    this.applySearch()
  },
  onNtfTabChange(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.ntfActiveTab) return
    const rows = this._ntfRows || []
    this.setData({
      ntfActiveTab: id,
      ...ntfPage.patchFromRows(rows, id),
    })
  },
  applySearch() {
    const tab = this.data.msgTab || 'all'
    if (tab === 'system') return
    const kw = String(this.data.searchKeyword || '').trim().toLowerCase()
    if (tab === 'group') {
      const pool = this.data.allGroupSessions || []
      const groupSessions = kw
        ? pool.filter((s) => {
            const blob = [s.title, s.lastText, s.mpOrderId].join(' ').toLowerCase()
            return blob.includes(kw)
          })
        : pool
      this.setData({ groupSessions })
      return
    }
    const pool = this.data.allSessions || []
    const sessions = kw
      ? pool.filter((s) => {
          const blob = [s.peerName, s.peerId, s.lastText].join(' ').toLowerCase()
          return blob.includes(kw)
        })
      : pool
    this.setData({ sessions })
  },
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
    this.applySearch()
  },
  findNtfRowById(id) {
    const sections = this.data.ntfSections || []
    for (let i = 0; i < sections.length; i++) {
      const found = (sections[i].rows || []).find((r) => r.id === id)
      if (found) return found
    }
    return (this._ntfRows || []).find((r) => r.id === id) || null
  },
  onOpenNotice(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const row = this.findNtfRowById(id)
    if (!row) return
    if (!row.read) {
      messagesStore.markNotificationsRead([row.id])
      messagesStore.markInboxSeen([row.id])
      const rows = (this._ntfRows || []).map((r) =>
        r.id === id ? this.enrichNtfRow({ ...r, read: true }) : r
      )
      this.reapplyNtfView(rows)
    }
    if (!row.canOpenDetail) return
    this._suppressShowReload = true
    if (row.detailUrl) {
      wx.navigateTo({ url: row.detailUrl })
      return
    }
    inboxCatalog.writeDetailPayload(row)
    wx.navigateTo({ url: '/pages/mine-notification-detail/mine-notification-detail' })
  },
  stopBubble() {},
  onPreviewInboxImage(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    this._suppressShowReload = true
    wx.previewImage({ urls: [url], current: url })
  },
  onSelectionAction(e) {
    const { id, action } = e.currentTarget.dataset
    if (!id || !action) return
    const row = this.findNtfRowById(id)
    if (!row) return
    inboxNoticeState.markHandled(row, action)
    messagesStore.markInboxSeen([row.id])
    if (row.fromSelection && row.dedupeKey) {
      talentInboxMatch.markSelectionNoticeSent(row.dedupeKey)
    }
    wx.showToast({
      title: action === 'joined' ? '已标记入群' : '已确认',
      icon: 'success',
    })
    const rows = (this._ntfRows || []).map((r) =>
      r.id === id ? this.enrichNtfRow(r) : r
    )
    this.reapplyNtfView(rows)
  },
  onMarkAllRead() {
    const rows = this._ntfRows || []
    const unreadIds = rows.filter((r) => r && !r.read).map((r) => r.id)
    if (!unreadIds.length) {
      wx.showToast({ title: '暂无未读消息', icon: 'none' })
      return
    }
    messagesStore.markAllNotificationsRead()
    wx.showToast({ title: '已全部标为已读', icon: 'success' })
    const next = rows.map((r) => this.enrichNtfRow({ ...r, read: true }))
    this.reapplyNtfView(next)
  },
  openGroupChat(e) {
    const mpOrderId = e.currentTarget.dataset.mpOrderId
    if (!mpOrderId) return
    this._suppressShowReload = true
    wx.navigateTo({
      url: `/pages/order-group-chat/order-group-chat?mpOrderId=${encodeURIComponent(mpOrderId)}`,
    })
  },
  openChat(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || '会话'
    const peerId = e.currentTarget.dataset.peerId || ''
    const avatar = e.currentTarget.dataset.avatar || ''
    if (!id) return
    const nextAll = (this.data.allSessions || []).map((s) =>
      String(s.id) === String(id) ? { ...s, unread: 0 } : s,
    )
    this.setData({ allSessions: nextAll }, () => this.applySearch())
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
