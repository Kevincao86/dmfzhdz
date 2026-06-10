const chat = require('../../utils/talentChat.js')
const participant = require('../../utils/participant.js')
const { applyCapsulePadding } = require('../../utils/navLayout.js')
const chatBadgeWatcher = require('../../utils/chatBadgeWatcher.js')
const wxProfileDisplay = require('../../utils/wxProfileDisplay.js')

function toRawMessages(uiList) {
  return (uiList || []).map((m) => ({
    id: m.id,
    fromRole: m.fromRole,
    text: m.text,
    ts: m.ts,
    at: m.at,
  }))
}

Page({
  data: {
    navBarStyle: '',
    navInnerStyle: '',
    sessionId: '',
    peerName: '会话',
    peerId: '',
    peerAvatar: '',
    myAvatar: '',
    messages: [],
    input: '',
    scrollTo: '',
    ready: false,
    statusSub: '连接中…',
    canSend: true,
    sendHint: '',
    inputPlaceholder: '输入消息…',
    turnHint: chat.CHAT_TURN_HINT,
    showTurnBanner: false,
  },
  onLoad(options) {
    applyCapsulePadding(this, null, { band: 'navBarStyle', right: 'navInnerStyle' })
    const sessionId = options && options.sessionId ? decodeURIComponent(options.sessionId) : ''
    const peerName = options && options.peerName ? decodeURIComponent(options.peerName) : '会话'
    const peerId = options && options.peerId ? decodeURIComponent(options.peerId) : ''
    const peerAvatar = wxProfileDisplay.sanitizeDisplayAvatar(
      options && options.peerAvatar ? decodeURIComponent(options.peerAvatar) : '',
    )
    const me = participant.getCurrentParticipant()
    this._sessionId = sessionId
    this._sinceTs = 0
    this._pollTimer = null
    this._devTest = !!(options && options.devTest === '1')
    this.setData({
      sessionId,
      peerName,
      peerId,
      peerAvatar,
      myAvatar: wxProfileDisplay.sanitizeDisplayAvatar(me.avatarUrl) || '/images/logo.png',
    })
    void this.bootstrap()
  },
  onShow() {
    this.startPoll()
    void this.syncCloud()
  },
  onHide() {
    this.stopPoll()
  },
  onUnload() {
    this.stopPoll()
    if (this._devTest) participant.clearParticipantOverride()
    void chatBadgeWatcher.refreshNow()
  },
  onBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/messages/messages' }) })
  },
  startPoll() {
    this.stopPoll()
    this._pollTimer = setInterval(() => {
      void this.syncCloud()
    }, chat.POLL_MS)
  },
  stopPoll() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
  },
  async bootstrap() {
    if (!this._sessionId || !chat.canChat()) {
      this.setData({ ready: false, statusSub: '未配置云端会话' })
      return
    }
    try {
      const base = participant.getCurrentParticipant()
      const sessions = await chat.listSessionsForMe(base)
      const cur = (sessions || []).find((s) => String(s.id) === String(this._sessionId))
      const me = cur ? chat.participantForSession(cur, base) : base
      this._chatPart = me
      await chat.syncProfile(me)
      if (cur) {
        const authKey = chat.sessionAuthKeyForMe(cur, base)
        const peer = participant.peerDisplay(cur, authKey)
        this.setData({
          peerName: peer.name,
          peerId: peer.peerId || this.data.peerId,
          peerAvatar: peer.avatar || this.data.peerAvatar,
        })
      }
      const rows = await chat.fetchMessages(this._sessionId, 0, me)
      const merged = chat.mergeMessages([], rows)
      await chat.markRead(this._sessionId, me)
      this.setData({ ready: true, statusSub: '消息已同步' })
      this.setMessages(merged, me.role)
    } catch (e) {
      this.setData({ ready: false, statusSub: chat.formatChatError(e).slice(0, 48) })
    }
  },
  async syncCloud() {
    if (!this._sessionId || !this.data.ready) return
    try {
      const rows = await chat.fetchMessages(this._sessionId, this._sinceTs, this._chatPart)
      if (!rows.length) return
      const me = this._chatPart || participant.getCurrentParticipant()
      const merged = chat.mergeMessages(toRawMessages(this.data.messages), rows)
      this.setMessages(merged, me.role)
      await chat.markRead(this._sessionId, me)
      void chatBadgeWatcher.refreshNow()
    } catch (_) {
      /* 轮询静默 */
    }
  },
  setMessages(list, myRole) {
    const ui = list.map((m) => ({
      id: m.id,
      fromRole: m.fromRole,
      text: m.text,
      at: m.at,
      ts: m.ts,
      mine: m.fromRole === myRole,
    }))
    const last = ui[ui.length - 1]
    if (ui.length) {
      this._sinceTs = Math.max(this._sinceTs, ...ui.map((m) => m.ts || 0))
    }
    const gate = chat.canSendNextMessage(ui, myRole)
    const ready = this.data.ready
    this.setData({
      messages: ui,
      scrollTo: last && last.id ? `msg-${last.id}` : '',
      canSend: ready && gate.ok,
      sendHint: gate.hint,
      inputPlaceholder: ready ? (gate.ok ? '输入消息…' : gate.hint) : '连接中…',
      showTurnBanner: ready && !gate.ok,
    })
  },
  onInput(e) {
    this.setData({ input: e.detail.value })
  },
  async onSend() {
    const text = String(this.data.input || '').trim()
    if (!text || !this._sessionId || !this.data.canSend) {
      if (this.data.sendHint) {
        wx.showToast({ title: this.data.sendHint, icon: 'none' })
      }
      return
    }
    const me = this._chatPart || participant.getCurrentParticipant()
    const mid = chat.newMsgId()
    const optimistic = {
      id: mid,
      fromRole: me.role,
      text,
      at: chat.formatTime(Date.now()),
      ts: Date.now(),
      mine: true,
    }
    const next = [...this.data.messages, optimistic]
    this.setData({ messages: next, input: '', scrollTo: `msg-${mid}` })
    this._sinceTs = Math.max(this._sinceTs, optimistic.ts)
    try {
      await chat.sendMessage(this._sessionId, text, mid, me)
      void this.syncCloud()
    } catch (e) {
      wx.showToast({ title: String(e.message || '发送失败'), icon: 'none' })
    }
  },
})
