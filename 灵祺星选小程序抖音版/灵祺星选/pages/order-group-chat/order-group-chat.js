const groupChat = require('../../utils/mpOrderGroupChatApi.js')
const participant = require('../../utils/participant.js')
const { applyCapsulePadding } = require('../../utils/navLayout.js')
const wxProfileDisplay = require('../../utils/wxProfileDisplay.js')

Page({
  data: {
    navBarStyle: '',
    navInnerStyle: '',
    mpOrderId: '',
    groupTitle: '商单群',
    memberCount: 0,
    messages: [],
    input: '',
    scrollTo: '',
    ready: false,
    statusSub: '连接中…',
    canSend: true,
    groupClosed: false,
    sending: false,
  },
  onLoad(options) {
    applyCapsulePadding(this, null, { band: 'navBarStyle', right: 'navInnerStyle' })
    const mpOrderId = options && options.mpOrderId ? decodeURIComponent(options.mpOrderId) : ''
    this._mpOrderId = mpOrderId
    this._sinceTs = 0
    this._pollTimer = null
    this.setData({ mpOrderId })
    void this.bootstrap()
  },
  onShow() {
    this.startPoll()
    void this.syncGroup()
  },
  onHide() {
    this.stopPoll()
  },
  onUnload() {
    this.stopPoll()
  },
  onBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/mine/mine' }) })
  },
  startPoll() {
    this.stopPoll()
    this._pollTimer = setInterval(() => {
      void this.syncGroup()
    }, groupChat.POLL_MS)
  },
  stopPoll() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
  },
  async bootstrap() {
    if (!this._mpOrderId) {
      this.setData({ ready: false, statusSub: '缺少商单号' })
      return
    }
    try {
      await this.syncGroup(true)
      this.setData({ ready: true })
    } catch (e) {
      this.setData({ ready: false, statusSub: String(e.message || '加载失败').slice(0, 40) })
    }
  },
  applyGroupPayload(body) {
    const group = body && body.group
    if (!group) return
    const myKey = groupChat.myParticipantKey()
    const ui = groupChat.mapMessages(group, myKey)
    const last = ui[ui.length - 1]
    if (ui.length) {
      this._sinceTs = Math.max(this._sinceTs, ...ui.map((m) => m.ts || 0))
    }
    const closed = group.status === 'closed' || body.canSend === false
    this.setData({
      groupTitle: group.title || '商单群',
      memberCount: (group.memberParticipantKeys || []).length,
      messages: ui,
      scrollTo: last && last.id ? `msg-${last.id}` : '',
      canSend: !closed,
      groupClosed: closed,
      statusSub: closed ? '已关闭' : '消息已同步',
    })
  },
  async syncGroup(forceScroll) {
    if (!this._mpOrderId) return
    try {
      const body = await groupChat.getGroup(this._mpOrderId)
      this.applyGroupPayload(body)
      if (forceScroll) {
        const last = (this.data.messages || [])[this.data.messages.length - 1]
        if (last && last.id) this.setData({ scrollTo: `msg-${last.id}` })
      }
    } catch (e) {
      if (!this.data.ready) throw e
    }
  },
  onInput(e) {
    this.setData({ input: e.detail.value })
  },
  async onSend() {
    const text = String(this.data.input || '').trim()
    if (!text || !this.data.canSend || this.data.sending) return
    this.setData({ sending: true })
    const mid = `local-${Date.now()}`
    const optimistic = {
      id: mid,
      type: 'text',
      text,
      mine: true,
      fromName: '我',
      at: groupChat.formatTime(Date.now()),
      ts: Date.now(),
    }
    const next = [...this.data.messages, optimistic]
    this.setData({ messages: next, input: '', scrollTo: `msg-${mid}` })
    try {
      await groupChat.sendMessage(this._mpOrderId, { type: 'text', text })
      await this.syncGroup()
    } catch (e) {
      wx.showToast({ title: String(e.message || '发送失败'), icon: 'none' })
    } finally {
      this.setData({ sending: false })
    }
  },
  onPickImage() {
    if (!this.data.canSend || this.data.sending) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) return
        void this.sendMedia(file.tempFilePath, 'image', file.fileType === 'image' ? 'image/jpeg' : 'image/jpeg')
      },
    })
  },
  onPickVideo() {
    if (!this.data.canSend || this.data.sending) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: 60,
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) return
        if (file.size > 15 * 1024 * 1024) {
          wx.showToast({ title: '视频请压缩至15MB以内', icon: 'none' })
          return
        }
        void this.sendMedia(file.tempFilePath, 'video', 'video/mp4')
      },
    })
  },
  async sendMedia(filePath, type, contentType) {
    if (!this.data.canSend || this.data.sending) return
    this.setData({ sending: true })
    wx.showLoading({ title: '上传中…', mask: true })
    try {
      const up = await groupChat.uploadMedia(filePath, contentType)
      const mediaUrl = String(up.mediaUrl || '').trim()
      if (!mediaUrl) throw new Error('上传失败')
      await groupChat.sendMessage(this._mpOrderId, { type, mediaUrl })
      await this.syncGroup(true)
    } catch (e) {
      wx.showToast({ title: String(e.message || '发送失败'), icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ sending: false })
    }
  },
  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    const urls = (this.data.messages || [])
      .filter((m) => m.type === 'image' && m.mediaUrl)
      .map((m) => m.mediaUrl)
    wx.previewImage({ urls: urls.length ? urls : [url], current: url })
  },
  onPlayVideo(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.previewMedia({ sources: [{ url, type: 'video' }] })
  },
})
