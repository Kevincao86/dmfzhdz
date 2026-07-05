const chat = require('../../../utils/talentChat.js')
const participant = require('../../../utils/participant.js')
const composer = require('../../../utils/mpChatComposer.js')
const groupChatApi = require('../../../utils/mpOrderGroupChatApi.js')
const richMsg = require('../../../utils/mpChatRichMessage.js')
const { applyCapsulePadding } = require('../../../utils/navLayout.js')
const chatBadgeWatcher = require('../../../utils/chatBadgeWatcher.js')
const wxProfileDisplay = require('../../../utils/wxProfileDisplay.js')

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
    showPlusPanel: false,
    voiceMode: false,
    recordingVoice: false,
    plusActions: composer.PLUS_ACTIONS,
    sending: false,
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
    this._recorder = composer.createRecorderManager(this)
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
    void chatBadgeWatcher.refreshNow({ clearOverride: true })
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
    const ui = list.map((m) => {
      const rich = richMsg.uiFromRaw({ text: m.text })
      return {
        id: m.id,
        fromRole: m.fromRole,
        text: m.text,
        kind: rich.kind,
        displayText: rich.displayText,
        mediaUrl: rich.mediaUrl,
        durationSec: rich.durationSec,
        latitude: rich.latitude,
        longitude: rich.longitude,
        locationName: rich.locationName,
        fileName: rich.fileName,
        at: m.at,
        ts: m.ts,
        mine: m.fromRole === myRole,
      }
    })
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
  onTogglePlus() {
    if (!this.data.canSend) return
    this.setData({ showPlusPanel: !this.data.showPlusPanel, voiceMode: false })
  },
  onToggleVoiceMode() {
    if (!this.data.canSend) return
    this.setData({ voiceMode: !this.data.voiceMode, showPlusPanel: false })
  },
  onVoiceTouchStart() {
    if (!this.data.canSend || this.data.sending) return
    composer.startVoiceRecord(this, this._recorder)
  },
  onVoiceTouchEnd(e) {
    const cancel = !!(e && e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientY < 120)
    composer.stopVoiceRecord(this, this._recorder, cancel)
  },
  async onVoiceRecorded({ filePath, durationSec }) {
    await this.sendRich({ kind: 'audio', filePath, contentType: 'audio/mpeg', durationSec })
  },
  onPlusAction(e) {
    const id = e.currentTarget.dataset.id
    if (!id || !this.data.canSend || this.data.sending) return
    this.setData({ showPlusPanel: false })
    if (id === 'image') void this.pickAndSend(composer.chooseAlbumImage)
    else if (id === 'camera') void this.pickAndSend(composer.takePhoto)
    else if (id === 'location') void this.sendLocation()
    else if (id === 'file') void this.pickAndSend(composer.chooseFile)
  },
  async pickAndSend(fn) {
    try {
      const picked = await fn()
      await this.sendRich(picked)
    } catch (e) {
      if (String(e.message || e) !== 'cancel') {
        wx.showToast({ title: String(e.message || '操作失败').slice(0, 20), icon: 'none' })
      }
    }
  },
  async sendLocation() {
    try {
      const loc = await composer.chooseLocation()
      await this.sendRich(loc, false)
    } catch (e) {
      if (String(e.message || e) !== 'cancel') {
        wx.showToast({ title: String(e.message || '位置失败').slice(0, 20), icon: 'none' })
      }
    }
  },
  async sendRich(picked, needUpload = true) {
    if (!this._sessionId || !this.data.canSend || this.data.sending) return
    const me = this._chatPart || participant.getCurrentParticipant()
    const mid = chat.newMsgId()
    this.setData({ sending: true })
    wx.showLoading({ title: '发送中…', mask: true })
    try {
      let payload = picked
      if (needUpload !== false && picked.filePath) {
        const up = await groupChatApi.uploadMedia(
          picked.filePath,
          picked.contentType || composer.guessContentType(picked.filePath),
          picked.fileName,
        )
        payload = { ...picked, mediaUrl: String(up.mediaUrl || '').trim() }
        if (!payload.mediaUrl) throw new Error('上传失败')
      }
      await chat.sendRichMessage(this._sessionId, payload, mid, me)
      void this.syncCloud()
    } catch (e) {
      wx.showToast({ title: String(e.message || '发送失败').slice(0, 24), icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ sending: false })
    }
  },
  async onSend() {
    const text = String(this.data.input || '').trim()
    if (!text || !this._sessionId || !this.data.canSend) {
      if (this.data.sendHint) wx.showToast({ title: this.data.sendHint, icon: 'none' })
      return
    }
    const me = this._chatPart || participant.getCurrentParticipant()
    const mid = chat.newMsgId()
    this.setData({ input: '', scrollTo: `msg-${mid}` })
    try {
      await chat.sendMessage(this._sessionId, text, mid, me)
      void this.syncCloud()
    } catch (e) {
      wx.showToast({ title: String(e.message || '发送失败'), icon: 'none' })
    }
  },
  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  },
  onPlayAudio(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    if (!this._innerAudio) this._innerAudio = wx.createInnerAudioContext()
    this._innerAudio.src = url
    this._innerAudio.play()
  },
  onOpenLocation(e) {
    const lat = Number(e.currentTarget.dataset.lat)
    const lng = Number(e.currentTarget.dataset.lng)
    const name = e.currentTarget.dataset.name || '位置'
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    wx.openLocation({ latitude: lat, longitude: lng, name, scale: 16 })
  },
  onOpenFile(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.showLoading({ title: '打开中…' })
    wx.downloadFile({
      url,
      success: (res) => wx.openDocument({ filePath: res.tempFilePath, showMenu: true }),
      fail: () => wx.showToast({ title: '无法打开文件', icon: 'none' }),
      complete: () => wx.hideLoading(),
    })
  },
})
